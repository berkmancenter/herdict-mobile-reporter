# Herdict Mobile Reporter 

## About 

Herdict mobile reporter is an Apache Cordova application (previously Phonegap) that functions as a mobile client for [herdict.org](http://herdict.org).

## Features

 - Nice UI
 - Report any site
 - Report from site lists
 - Report sites even if Herdict is blocked
 - View top reported sites in your country
 - Lookup accessibility data for any site

## Specs

Herdict mobile reporter was designed as an Apache Cordova for iOS application and should be able to be easily ported to other Cordova platforms. Herdict mobile reporter only requires the ChildBrowser plugin to run. ChildBrowser.js should be placed in `resources/js/`.

## Third Party Software

* iOS SDK
* jQuery
* jQUery Mobile
* Apache Cordova (Formerly Phonegap)
** Childbrowser plugin

## Copyright

Copyright President and Fellows of Harvard College, 2012

## Test Cases

*The following cases should work*

1. Open the application and click 'Report', you should be brought to a walkthrough page; if you click 'Don't show this again' and restart the application and press report you should be brought directly to report page.

2. Fresh install, turn off wifi and navigate to the report page, and scroll down to the options. All the lists should have loaded options.

3. (With wifi on) press the star in the top right and the list selection should load, select a list and it should start loading the list of sites for you to test.

4. Turn off wifi and report a URL (google.com), it should retain the site in memory to report later. Then turn wifi back on, wait 1 minute and the site should have been reported (you can check this by going to the raw data feed on Herdict).

5. Turn off wifi and click view, it shoul tell you you can't view data without wifi and return you to the homescreen.

6. (With wifi on) Click view, it should show a list of sites top reported in your country. Proceed to lookup a specific site and search a site, it should provide you with accessibility results.

7. On the homescreen click 'website', it should open up a browser and bring you to herdict.org
