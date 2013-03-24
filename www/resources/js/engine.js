// *******************
// *** reporter ******
// *******************

// ensure we can make cross site requests
$(document).bind( "mobileinit", function() {
    $.mobile.allowCrossDomainPages = true;
    $.support.cors = true;
});

// All the data we must load
var toLoad = ["categories", "countries", "locations", "interests", "reasons"];
var locationData = {
	countryShort:undefined,
	ipTo:undefined,
	countryLong:undefined,
	ipFrom:undefined,
	ispName:undefined
};

/* 
 * Fetches location data on a recurring basis
 */
function updateLocationData(){
	$.ajax({
		url: 'http://www.herdict.org/action/ajax/plugin/init-currentLocation/',
		success: function (data, status, jqxhr){
			// parse data
			var clean = cleanJSON(jqxhr.responseText);
			locationData = $.parseJSON(clean);
			// update fields
			$("#ispField")[0].value = locationData.ispName;
		}
	});
	// update later
	setTimeout(updateLocationData, 60000);
}

// load data
$(document).ready(function (){
	updateLocationData();
	// Actually put data into select fields when open page
	$("#report").one("pageinit", loadOtherFields);
});

/*
 *load the other (non-isp and non-country) fields
 */
function loadOtherFields(){
	// init fields
	for (var i = 0; i < toLoad.length; i++){
		$.ajax({
			url: 'http://www.herdict.org/action/ajax/plugin/init-'+toLoad[i]+'/',
			// test if we can access herdict, if we can use its data
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
			// if we can't, then check backup and fallback on local file system
			error: (function (section){
				return (function(jqxhr, status, errThrown) {
					// query db
					var db = connectToBackupDB();
					db.transaction(function (t){
						t.executeSql("SELECT * FROM backup WHERE keyTxt = ?", [section], function (transaction, result){
							// check if DB has data
							if (result.rows.length > 0){
								// load data in
								var fields = $.parseJSON(result.rows.item(0).valueTxt);
								for (var key in fields){
									populateFields(section, fields[key]);
								}
								loadedData(section);
							}
							// Data never stored in DB, so fallback on local storage
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

var countriesLoaded = 1; // the default "select country" option is already poulated

/*
 * actually fills in select value
 *
 * section - what section needs to be update
 * obj - the result object {'value', 'label'}
 */
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

/*
 * Check if all th edata has been loaded
 * 
 * sectionLoaded - which specific piece of data 
 */
function loadedData(sectionLoaded){
	fieldsLoaded++;
	if (fieldsLoaded == toLoad.length){
		resetAllFields();
	}
}

/*
 * Connects to backup database to store results in case herdict later becomes inaccessible
 */
function connectToBackupDB(){
	var db = window.openDatabase("fallbacks", "1.0", "Herdict fallbacks incase herdict is inaccessible", 102400);
	db.transaction(function (t){
		t.executeSql("CREATE TABLE IF NOT EXISTS backup (keyTxt varchar(40) PRIMARY KEY, valueTxt varchar(10000))");
	});
	return db;
}

/*
 * Connects to queue incase herdict is inaccessible
 */
function connectToQueue(){
	var db = window.openDatabase("toSend", "1.0", "Herdict report queue", 102400);
	db.transaction(function (t){
		t.executeSql("CREATE TABLE IF NOT EXISTS toSendQueue (id INTEGER PRIMARY KEY AUTOINCREMENT, category varchar(100), country varchar(3), location varchar(100), interest varchar(100), reason varchar(100), isp varchar(255), url varchar(4000),  accessible boolean, comment varchar(255))",
		[],
		function (t, r){

		}, 
		function (t, e){
			alert(e.message);
		});
	});
	return db;
}

var sitesReported = 0;

/*
 * Add site to queue
 *
 * Accessible Boolean - whether the tested site was accessible
 */
function queueUp(accessibleBoolean){
	if ($("#urlField")[0].value != ""){
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
			navigator.notification.alert("Your report has been recorded.", function (){}, "Thanks", "Ok");
		}
		$("#reportedContent").prepend("<div class='" + (accessible ? "" : "in") + "accessible'>" + $("#urlField")[0].value + "</div>");
		if ($("#reportedContent div").length > 4){
			$($("#reportedContent div")[4]).remove();
		}
		sitesReported++;
		$("#numberReported").html(sitesReported.toString());
		resetAllFields();
	}
}

/*
 * Resets all the reporter input fields
 */
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

/*
 * DeQueue's data
 */
function deQueue(){
	var db = connectToQueue();
	db.transaction(function (t){
		t.executeSql("SELECT * FROM toSendQueue", [], 
			function (t, r){
				// send data to server
				var resultsLen = r.rows.length;
				for (var i = 0; i < resultsLen; i++){
					// prep for api
					var sourceId = "6";
					var reportRequest = "http://herdict.org/action/ajax/plugin/report?" + (r.rows.item(i).accessible ? "siteAccessible" : "siteInaccessible") + "&report.url=" + encodeURIComponent(r.rows.item(i).url) + "&report.country.shortName=" + encodeURIComponent(r.rows.item(i).country) + "&report.ispName=" + encodeURIComponent(r.rows.item(i).isp) + "&report.location=" + encodeURIComponent(r.rows.item(i).location) + "&report.interest=" + encodeURIComponent(r.rows.item(i).interest) + "&report.reason=" + encodeURIComponent(r.rows.item(i).reason) + "&report.tag=" + encodeURIComponent(r.rows.item(i).category) + "&report.comments=" + encodeURIComponent(r.rows.item(i).comment) + "&defaultCountryCode=" + encodeURIComponent(locationData.countryShort) + "&defaultISPName=" + encodeURIComponent(locationData.ispName) + "&report.sourceId=" + sourceId + "&encoding=ROT13"; 
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

/*
 * Check id there is data in the queue
 */
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

// check if data needs to be sent when app opens
$(document).ready(function (){
	checkIfDequeue();
});

// prevent us form dual caling deQueue
var checkingHerdict;

/*
 * Ccheck if herdict is accessible
 */
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
			if (typeof(checkingHerdict) === "undefined"){
				checkingHerdict = setTimeout(checkHerdict, 60000);
			}
		} 
	});
}

// functions for domain roulette
var randomMode = false;
var randomQueue;
var hideFromReporter = false;

/*
 * Loads site to test from the list
 */
function loadRandomDomain(){
	// only do this if random mode enabled
	if (randomMode){
		var randomDomain = randomQueue.shift();
		if (typeof(randomDomain) === 'undefined'){
			navigator.notification.alert("You completed the entire " + lists[listId] + " list. Nice job!", function (){}, "Wow! Thanks!", "Ok");
			toggleRandom();
		}
		else {
			// skip explicit sites
			if (randomDomain.page.adult === true){
				loadRandomDomain();
			}
			else {
				hideFromReporter = randomDomain.page.site.hideFromReporter;
				$("#urlField")[0].value = randomDomain.page.site.url;
				$("#urlField").trigger("change");
			}
		}
	}
}

/*
 * Toggles random mode (when you are searching from list
 */
function toggleRandom(){
	if (!randomMode){
		randomMode = true;
		$("#randomButton").addClass("toggledOn");
		$('#queueNotice').css('display', 'block');
		$('#queueNotice').click();
	}
	else {
		randomMode = false;
		$("#randomButton").removeClass("toggledOn");
		$('#queueNotice').css('display', 'none');
	}
}

/*
 * ROT13 Encode, strip any unnecessary data
 *
 * url - url to encode
 */
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
/*
 * Herdict sometimes returns bad json (surrounded in parens), this fixes it
 * 
 * json - dirty json
 */
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

/*
 * Scrolls to bottom of page
 */
function scrollToBottom(){
	$(window).scrollTop($(document).height());
}

// *******************
// *** select list ***
// *******************

var listId;

/*
 * Selects a list ot start reporting from
 * 
 * givenId - ID of selected list
 */
function selectList(givenId){
	// load list
	randomQueue = remoteLists[givenId].userListPages;
	// ui stuff
	listId = givenId;
	$('#listSelect').dialog('close');
	$('#whichList').html(lists[listId]);
	loadRandomDomain();
}

var lists = new Array();
var remoteLists;

/*
 * Loads list of lists
 */
function loadLists(){
	// clear
	$('#listSelectList').html('<li>Loading...</li>');
	$('#listSelectList').listview('refresh');
	$.ajax({
		url: 'http://herdict.org/ajax/lists/sponsored',
		success: function (data, status, jqxhr){
			remoteLists = $.parseJSON(jqxhr.responseText);
				$.ajax({
					url: 'http://herdict.org/ajax/lists/herdict',
					success: function (data, status, jqxhr){
						remoteLists = remoteLists.concat($.parseJSON(jqxhr.responseText));
						for (var i = 0; i < remoteLists.length; i++){
							var currentList = remoteLists[i];
							lists[i] = currentList.user.username;
						}
						doneLoadingLists();
					},
					error: function (){
						navigator.notification.alert("You must be able to access herdict.org to select lists.", function (){
							// as if they closed it
							$('#listSelect div[data-role="header"] a').trigger('click');
						}, "Sorry!", "Ok");
					}
			});
		},
		error: function (){
			navigator.notification.alert("You must be able to access herdict.org to select lists.", function (){
				// as if they closed it
				$('#listSelect div[data-role="header"] a').trigger('click');
			}, "Sorry!", "Ok");
		}
	});
}

/*
 * Renders lists on screen
 */
function doneLoadingLists(){
	$('#listSelectList').html('');
	for (var key in lists){
		$('#listSelectList').prepend("<li><a href='#' onclick='selectList(" + key + ")'>" + lists[key] + "</a></li>");
	}
	$('#listSelectList').listview('refresh');
}

// make it so not choosing a list disables random mode
$(document).ready(function (){
	$("#listSelect").on("pageshow", function (){
		loadLists();
	});
	// only bind this once
	$("#listSelect").one("pageshow", function (){
		$('#listSelect div[data-role="header"] a').on('click', function (){
			toggleRandom();
		});
	});
});


// *******************
// *** walkthrough ***
// *******************

// a little bit of abstraction so that the variable skipWalkthrough is persistent
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

// skips walkthrough if that is setting
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
// *** viewer ********
// *******************

/*
 * Gets accessibility data for a URL
 */
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
			$("#urlCheckField").blur();
		}
	});
}

// *******************
// ***** home ********
// *******************

/*
 * Makes both buttons take up 1/2 the screen
 */
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


// *******************
// ** GET TOP SITES **
// *******************

/*
 * Get top reported sites in your area
 */
function getTopSites(){
	$.ajax({
		url: 'http://www.herdict.org/explore/module/topsites?fc=' + locationData.countryShort,
		success: function (data, status, jqxhr){
			// convert to DOM object so I can traverse it for good parts
			var DOMObj = $('<div>' + jqxhr.responseText + '</div>');
			$("#topsitesContent").html(DOMObj.children("div")[0].innerHTML);
			$("#topsitesContent").children("a").attr("href", "#");
			$("#topsitesContent").prepend("<div id='topsiteNote'>(In your country)</div>");
		},
		error: function (){
			$.mobile.changePage("#error");
		}
	});
}
$(document).ready(function (){
	$("#topsites").on("pageshow", getTopSites);
});

// *******************************
// * MODIFY HTML EVENT HANDLERS **
// *******************************

document.addEventListener("deviceready", function(){
	// EXTERNAL LINKS
	$("a[target='_blank']").on("click", function (e){
		window.open($(this).data("external-href"), '_blank', 'location=yes');
	});

	// REPORTER PREVIEW WINDOW
	var currentURL;
	function updateIframeLocation(){
		var url = $("#urlField")[0].value;
		if (url != ""){
			if (url.substr(0,7) != "http://"){
				url = "http://" + url;
			}
			currentURL = url;
			openUpLink();
		}
	}
	$("#urlField").on("change", updateIframeLocation);
	function openUpLink(){
		window.open(currentURL, '_blank', 'location=yes');
	}

	// REPORTER COUNTRY SELECTION
	function updateLocationHeader(){
		$("#locationHeader .ui-btn-text").html($("#countriesField")[0].value + " - " + $("#locationsField option:selected").html());
	}
	$("#countriesField").on("change", updateLocationHeader);
	$("#locationsField").on("change", updateLocationHeader);

	// SKIP WALKTHRU BUTTON
	$("#neverShowWalkthrough").on("click", function (){
		window.skipWalkthrough = "true";
	});
});
