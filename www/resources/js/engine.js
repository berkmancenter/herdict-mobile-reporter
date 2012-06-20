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
			//var locationData = $.parseJSON(jqxhr.responseText);
			locationData = $.parseJSON('{"countryShort":"US","ipTo":2365063167,"countryLong":"United States","ipFrom":2364997632,"ispName":"HARVARD UNIVERSITY"}');
			$("#ispField")[0].value = locationData.ispName;
			loadOtherFields();
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

var countriesLoaded = 0;

function populateFields(section, obj){
	$("#"+section+"Field").append('<option value="' + obj.value + '">' + obj.label + '</option>');
	if (section == "countries"){
		countriesLoaded++;
	}
	if (obj.value == locationData.countryShort){
		$("#countriesField")[0].selectedIndex = (countriesLoaded - 1);
		$("#countriesField").selectmenu("refresh");
	}
}

fieldsLoaded = 0;

function loadedData(){
	fieldsLoaded++;
	if (fieldsLoaded == toLoad.length){

	}
}

function connectToBackupDB(){
	var db = window.openDatabase("fallbacks", "1.0", "Herdict fallbacks incase herdict is inaccessible", 102400);
	db.transaction(function (t){
		t.executeSql("CREATE TABLE backup (keyTxt varchar(40) PRIMARY KEY, valueTxt varchar(10000))");
	});
	return db;
}

function connectToQueue(){
	var db = window.openDatabase("queue", "1.0", "Herdict report queue", 102400);
	db.transaction(function (t){
		t.executeSql("CREATE TABLE queue (id int PRIMARY KEY AUTO_INCREMENT, category varchar(100), country varchar(3), location varchar(100), interest varchar(100), reason varchar(100), isp varchar(255), url varchar(4000), accessible bit)");
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
	var url = $("#urlField")[0].value;
	var accessible = (accessibleBoolean ? 1 : 0);
	// store in db
	var db = connectToQueue();
	db.transaction(function (t){
		t.executeSql("INSERT INTO queue(category, country, location, interest, reason, isp, url, accessible) VALUES (?, ?, ?, ?, ?, ?, ?)", 
			[category, country, location, interest, reason, isp, url, accessible],
			function (t, r){
				// begin checking until I can dequeue
				checkHerdict();
			},
			function (t, e){}
		);
	});
	// clear text fields
	$("#categoriesField option:selected").removeAttr("selected");
	$("#categoriesField").selectmenu("refresh");
	$("#interestsField option:selected").removeAttr("selected");
	$("#interestsField").selectmenu("refresh");
	$("#reasonsField option:selected").removeAttr("selected");
	$("#reasonsField").selectmenu("refresh");
	$("#urlField")[0].value = "";
}
function deQueue(){
	// connect to db
	var db = connectToQueue();
	db.transaction(function (t){
		t.executeSql("SELECT * FROM queue", [] , function (t, r){
			// send data to server
			var resultsLen = r.rows.length;
			for (var i = 0; i < resultsLen; i++){
				// TODO: Make API Call
			}
		});
	});
}
function checkHerdict(){
	// check if site is accessible, if so, dequeue 

	// if not, check again soon

}