// *******************
// *** reporter ******
// *******************

$(document).bind( "mobileinit", function() {
	// allow cross site requests
    $.mobile.allowCrossDomainPages = true;
    $.support.cors = true;
});

var toLoad = ["categories", "countries", "locations", "interests", "reasons"];
var locationData;
$(document).ready(function (){
	$.ajax({
		url: 'http://www.herdict.org/action/ajax/plugin/init-currentLocation/',
		success: function (data, status, jqxhr){
			var clean = cleanJSON(jqxhr.responseText);
			locationData = $.parseJSON(clean);
			$("#ispField")[0].value = locationData.ispName;
			$("#report").one("pageinit", loadOtherFields);
		}
	});
});
function loadOtherFields(){
	// init fields
	for (var i = 0; i < toLoad.length; i++){
		$.ajax({
			url: 'http://www.herdict.org/action/ajax/plugin/init-'+toLoad[i]+'/',
			success: (function (section){
				return (function(data, status, jqxhr) {
					// actually populate field
					var fields = $.parseJSON(jqxhr.responseText);
					for (var key in fields){
						populateFields(section, fields[key]);
					}
					loadedData(section);
					// store data in db for later use
					var db = connectToBackupDB();
					db.transaction(function (t){
						t.executeSql("REPLACE INTO backup (keyTxt, valueTxt) VALUES (?, ?)", [section, jqxhr.responseText]);
					});
				});
			})(toLoad[i]),
			error: (function (section){
				return (function(jqxhr, status, errThrown) {
					// query db
					var db = connectToBackupDB();
					db.transaction(function (t){
						t.executeSql("SELECT * FROM backup WHERE keyTxt = ?", [section], function (transaction, result){
							if (result.rows.length > 0){
								// load data in
								var fields = $.parseJSON(result.rows.item(0).valueTxt);
								for (var key in fields){
									populateFields(section, fields[key]);
								}
								loadedData(section);
							}
							else {
								$.ajax({
									url: 'fallbackData/'+section+'.txt',
									success: function (data, status, jqxhr){
										// actually populate field
										var fields = $.parseJSON(jqxhr.responseText);
										for (var key in fields){
											populateFields(section, fields[key]);
										}
										loadedData(section);
									}
								});
							}
						}, function (transaction, error){});
					});
				});
			})(toLoad[i])
		});
	}
}

var countriesLoaded = 1; // the default "select country"

function populateFields(section, obj){
	$("#"+section+"Field").append('<option value="' + obj.value + '">' + obj.label + '</option>');
	if (section == "countries"){
		countriesLoaded++;
	}
	if (obj.value == locationData.countryShort){
		$("#countriesField")[0].selectedIndex = (countriesLoaded - 1);
		$("#countriesField").selectmenu("refresh");
		$("#countriesField").trigger("change");
	}
}

var fieldsLoaded = 0;

function loadedData(sectionLoaded){
	fieldsLoaded++;
	if (fieldsLoaded == toLoad.length){
		resetAllFields();
	}
}

function connectToBackupDB(){
	var db = window.openDatabase("fallbacks", "1.0", "Herdict fallbacks incase herdict is inaccessible", 102400);
	db.transaction(function (t){
		t.executeSql("CREATE TABLE IF NOT EXISTS backup (keyTxt varchar(40) PRIMARY KEY, valueTxt varchar(10000))");
	});
	return db;
}

function connectToQueue(){
	var db = window.openDatabase("toSend", "1.0", "Herdict report queue", 102400);
	db.transaction(function (t){
		t.executeSql("CREATE TABLE IF NOT EXISTS toSendQueue (id INTEGER PRIMARY KEY AUTOINCREMENT, category varchar(100), country varchar(3), location varchar(100), interest varchar(100), reason varchar(100), isp varchar(255), url varchar(4000),  accessible boolean, comment varchar(2000))",
		[],
		function (t, r){

		}, 
		function (t, e){
			alert(e.message);
		});
	});
	return db;
}

function queueUp(accessibleBoolean){
	// get data
	var category = $("#categoriesField")[0].value;
	var country = $("#countriesField")[0].value;
	var location = $("#locationsField")[0].value;
	var interest = $("#interestsField")[0].value;
	var reason = $("#reasonsField")[0].value; 
	var isp = $("#ispField")[0].value;
	var url = prepareURL($("#urlField")[0].value);
	var accessible = (accessibleBoolean ? 1 : 0);
	var comment = $("#commentField")[0].value;
	// store in db
	var db = connectToQueue();
	db.transaction(function (t){
		t.executeSql("INSERT INTO toSendQueue (category, country, location, interest, reason, isp, url, accessible, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
			[category, country, location, interest, reason, isp, url, accessible, comment],
			function (t, r){
				// begin checking until I can dequeue
				checkHerdict();
			},
			function (t, e){
				alert(e.message);
			}
		);
	});
	if (!randomMode){
		navigator.notification.alert("Your report has been recorded.", function (){}, "Thanks", "Ok")
	}
	resetAllFields();
	
}
function resetAllFields(){
	$("#categoriesField option:selected").removeAttr("selected");
	$("#categoriesField").selectmenu("refresh");
	$("#interestsField option:selected").removeAttr("selected");
	$("#interestsField").selectmenu("refresh");
	$("#reasonsField option:selected").removeAttr("selected");
	$("#reasonsField").selectmenu("refresh");
	$("#urlField")[0].value = "";
	$("#commentField")[0].value = "";
	$(".accessSubmit").removeClass("ui-btn-active");
}
function deQueue(){
	var db = connectToQueue();
	db.transaction(function (t){
		t.executeSql("SELECT * FROM toSendQueue", [], 
			function (t, r){
				// send data to server
				var resultsLen = r.rows.length;
				for (var i = 0; i < resultsLen; i++){
					// prep for api
					// TODO: add report.sourceID
					var sourceId = "1"
					// TODO: Replace dev2 with www
					var reportRequest = "http://dev2.herdict.org/action/ajax/plugin/report?" + (r.rows.item(i).accessible ? "siteAccessible" : "siteInaccessible") + "&report.url=" + encodeURIComponent(r.rows.item(i).url) + "&report.country.shortName=" + encodeURIComponent(r.rows.item(i).country) + "&report.ispName=" + encodeURIComponent(r.rows.item(i).isp) + "&report.location=" + encodeURIComponent(r.rows.item(i).location) + "&report.interest=" + encodeURIComponent(r.rows.item(i).interest) + "&report.reason=" + encodeURIComponent(r.rows.item(i).reason) + "&report.tag=" + encodeURIComponent(r.rows.item(i).category) + "&report.comments=" + encodeURIComponent(r.rows.item(i).comment) + "&defaultCountryCode=" + encodeURIComponent(locationData.countryShort) + "&defaultISPName=" + encodeURIComponent(locationData.ispName) + "&report.sourceId=" + sourceId + "&encoding=ROT13"; 
					// report 
					$.ajax({
						url: reportRequest,
						complete: (function (idToRemove){
							return(function (){
								var db = connectToQueue();
								db.transaction(function (t){
									t.executeSql("DELETE FROM toSendQueue WHERE id=?", [idToRemove]);
								});
							});
						})(r.rows.item(i).id)
					});
				}
			}
		);
	});
	 loadRandomDomain();
}

function checkIfDequeue(){
	var db = connectToQueue();
	db.transaction(function (t){
		t.executeSql("SELECT * FROM toSendQueue", [], 
			function (t, r){
				if (r.rows.length > 0){
					// so there is data left to dequeue
					checkHerdict();
				}
			}
		);
	});
}

$(document).ready(function (){
	checkIfDequeue();
});

var checkingHerdict;

function checkHerdict(){
	checkingHerdict = undefined;
	// check if site is accessible, if so, dequeue 
	$.ajax({
		url:'http://www.herdict.org',
		success: function (){
			deQueue();
		},
		error: function (){
			// check again later, if not already going to do so
			if (typeof(checkHerdict) === "undefined"){
				checkingHerdict = setTimeout(checkHerdict, 60000);
			}
		} 
	});
}

// functions for domain roulette

var randomMode = false;
var randomQueue;
var hideFromReporter = false;
var currentListId;

function loadRandomDomain(){
	if (randomMode){
		if (typeof(randomQueue) == 'undefined' || currentListId != listId){
			currentListId = listId;
			$.ajax({
				url: 'http://herdict.podconsulting.net/ajax/lists/' + listId + '/pages',
				success: function (data, status, jqxhr){
					randomQueue = $.parseJSON(jqxhr.responseText);
					randomQueue.reverse(); // so that the most important item is last and can easily be popped
					loadRandomDomain();
				},
			});
		}
		else {
			var randomDomain = randomQueue.pop();
			if (randomDomain.adult === true){
				loadRandomDomain();
			}
			else {
				hideFromReporter = randomDomain.site.hideFromReporter;
				$("#urlField")[0].value = randomDomain.site.url;
				$("#urlField").trigger("change");
			}
		}
		// TODO:possibly delete?, tries to guess category based on categorization group
		/*
		$('#categoriesField option:selected').removeAttr("selected");
		$($('#categoriesField option[value^="' + randomDomain.site.category + '"]')[0]).prop("selected", true);
		$('#categoriesField').selectmenu("refresh");
		*/
	}
}

function toggleRandom(){
	if (!randomMode){
		randomMode = true;
		$("#randomButton").addClass("toggledOn");
		$('#dummySelectListDialogLink').click();
	}
	else {
		randomMode = false;
		$("#randomButton").removeClass("toggledOn");
	}
}

function prepareURL(url){
	// strip http
	if (url.substr(0,7) == "http://"){
		url = url.substr(7);
	}
	// strip any trailing path, query, or hash
	var offendingCharacters = ["/", "?", "#"];
	for (var i = 0; i < offendingCharacters.length; i++){
		url = (url.split(offendingCharacters[i]))[0];
	}
	// rot13
	var lowercase = "abcdefghijklmnopqrstuvwxyz";
 	url = url.toLowerCase();
	var urlArray = url.split("");
	var lettersToIterateThru = urlArray.length;
	for (var i = 0; i < lettersToIterateThru; i++){
		var currentPosition = lowercase.indexOf(urlArray[i]);
		if (currentPosition >= 0){
			currentPosition += 13;
			currentPosition = currentPosition%26;
			urlArray[i] = lowercase[currentPosition];
		}
	}
	url = urlArray.join("");
	// that's all folks
	return url;
}

function cleanJSON(json){
	var start = 0;
	var end = json.length;
	if (json.charAt(0) == "("){
		start++;
	}
	if (json.charAt(end - 1) == ")"){
		end--;
	}
	return json.slice(start, end);
}

function scrollToBottom(){
	$(window).scrollTop($(document).height());
}

// *******************
// *** select list ***
// *******************

var listId;

function selectList(givenId){
	listId = givenId;
	$('#listSelect').dialog('close');
	loadRandomDomain();
}

var lists = new Array();

function loadLists(){
	// TODO: Replace with API call when availiable
	lists[-1] = "Herdict Web";
	lists[2] = "EFF";
	lists[3] = "Reporters without Borders";
	doneLoadingLists();
}

function doneLoadingLists(){
	for (key in lists){
		$('#listSelectList').prepend("<li><a href='#' onclick='selectList(" + key + ")'>" + lists[key] + "</a></li>");
	}
}

$(document).ready(function (){
	loadLists();
	$("#listSelect").one("pageinit", function (){
		$('#listSelectList').listview('refresh');
		$('#listSelect div[data-role="header"] a').on('click', function (){
			toggleRandom();
		});
	});
});


// *******************
// *** walkthrough ***
// *******************

Object.defineProperty(window, "skipWalkthrough", {
	get : function(){
        if (window.localStorage.getItem("skipWalkthrough") === null){
        	window.localStorage.setItem("skipWalkthrough", "false");
        }
        return window.localStorage.getItem("skipWalkthrough");
    },  
    set : function(newValue){
    	window.localStorage.setItem("skipWalkthrough", newValue);
    },  
    enumerable : true,  
    configurable : true
});

$(document).on("pagebeforechange", function (e, data){
	if (typeof(data.toPage) === "object"){
		if (data.toPage.is($("#walkthrough"))){
			if (window.skipWalkthrough == "true"){
				data.toPage = "#report";
			}
		}
	}
});



// *******************
// *** child browser *
// *******************

var childbrowser;
 
function onBodyLoad(){
	document.addEventListener("deviceready", onDeviceReady, false);
}
 
function onDeviceReady(){
	// do your thing!
	childbrowser = ChildBrowser.install();
}
/*
function onLinkClick(){   
    if(childbrowser != null){
        childbrowser.onLocationChange = function(loc){ alert("In index.html new loc = " + loc); };
        childbrowser.onClose = function(){alert("In index.html child browser closed");};
        childbrowser.onOpenExternal = function(){alert("In index.html onOpenExternal");};
 
        window.plugins.childBrowser.showWebPage("http://google.com");
    }  
}
*/

// *******************
// *** viewer ********
// *******************

function checkLink(){
	var currentURL = $("#urlCheckField")[0].value;
	currentURL = prepareURL(currentURL);
	$.ajax({
		url: 'http://www.herdict.org/action/ajax/plugin/site/'+currentURL+'/'+locationData.countryShort+'/ROT13/',
		success: function(data, status, jqxhr) {
			var clean = cleanJSON(jqxhr.responseText);
			var siteData = $.parseJSON(clean);
			$("#herdometer div").removeClass("activeSheep");
			$($("#herdometer div")[siteData.sheepColor]).addClass("activeSheep");
			$("#globalCount").html(siteData.globalInaccessibleCount);
			$("#localCount").html(siteData.countryInaccessibleCount);
			$(".herdometerSite").html($("#urlCheckField")[0].value);
			$("#herdometerData").css('display', 'block');
		}
	});
}

// *******************
// ***** home ********
// *******************

function resizeHome(){
	// grab basics
	var availiableHeight = $(window).height();
	var availiableWidth = $(window).width();
	// subtract padding and navbar
	availiableHeight -= 30; // padding
	availiableHeight -= 42; // navbar
	availiableWidth -= 30; // padding
	// get whichever is larger 
	if (availiableHeight >= availiableWidth){
		$("#reportHomeLink, #queryHomeLink").height((availiableHeight - 10)/2);
		$("#reportHomeLink, #queryHomeLink").width(availiableWidth);
		$("#queryHomeLink").css("margin-top", "10px");
		$("#queryHomeLink").css("margin-left", "0");
	}
	else {
		$("#reportHomeLink, #queryHomeLink").width((availiableWidth - 20)/2);
		$("#reportHomeLink, #queryHomeLink").height(availiableHeight);
		$("#queryHomeLink").css("margin-left", "10px");
		$("#queryHomeLink").css("margin-top", "0");
	}
	// center content in each
	$("#reportHomeLink > span, #queryHomeLink > span").each(function (index, el){
		var newHeight = ($(el).parent().height() - 102)/2;
		$(el).css("margin-top", newHeight);
	});
}

$(window).on('resize', function (){
	resizeHome();
	// stops odd scroll bar glitch
	resizeHome();
});
$(document).one("pageshow", function (){
	resizeHome();
	// stops odd scroll bar glitch
	resizeHome();
});