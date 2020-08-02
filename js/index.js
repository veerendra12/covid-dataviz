const ANIMATION_INTERVAL = 20;
const EVENT_PAUSE_INTERVAL = 2500;
const ONE_DAY = 60 * 60 * 24 * 1000;

const DATA_USMAP_TOPJSON = "data/counties-albers-10m.json";
const DATA_STATE_CODES = "data/state_codes.csv";
const DATA_STATE_CONFIRMED_CASES = "data/usa_state_covid_confirmed_cases_stats.csv";
const DATA_STATE_CONFIRMED_CASE_EVENTS = "data/usa_state_confirmed_cases_events.json";
const DATA_STATE_DEATHS = "data/usa_state_covid_deaths_stats.csv";
const DATA_STATE_DEATHS_ROLLING_AVG_EVENTS = "data/usa_state_deaths_rolling_avg_events.json";
const DATA_STATE_COLORS = "data/state-colors.json";
const DATA_CORONA_SVG = "data/corona_svg.json";
const DATA_IDS = "data/Ids.json";

var Dims = {
    MainSvg : {
        Width: -1,
        Height: -1
    },
    MainSvgChart : {
        Width: -1,
        Height: -1       
    },
    LegendChart : {
        Width : -1,
        Height : 120
    },
    EventsChart : {
        Width : 400,
        Height : 800
    },
    Margin : {
        Top: 100, 
        Bottom: 50, 
        Left: 50, 
        Right: 50
    },
    NavigationBox : {
        Width: 100,
        Height: 20
    }
};

var IDs;
var timer;
var geoJson;

var countyFeaturesMap = {};
var stateFeaturesMap = {};
var populationDataFormatted = [];
var dataUSTopJson;
var minPopulation;
var maxPopulation;
var stateCodes;
var dataDatewiseStateConfirmedCases;
var dataStateEvents;
var dataStateCodes;
var stateCodesMap;
var dataStateConfirmedCasesDateNested = {};
var dataDateRange;
var currDate;
var dataCoronaSvgPaths;
var stateToCentroids = {};
var dataCoronaSvgPaths;

computeDims();

setLayoutSizings();

drawStory();

function drawStory() {
    init();
    addNavigationControls();

    d3.json(DATA_CORONA_SVG)
    .then(function (data) {
        dataCoronaSvgPaths = data;
        renderBackground();
    });
}

function init() {

}

function computeDims() {
    var totalHeight = window.innerHeight;
    var totalWidth = window.innerWidth;

    Dims.MainSvg.Width = totalWidth;
    Dims.MainSvg.Height = totalHeight;

    Dims.MainSvgChart.Width = Dims.MainSvg.Width - Dims.Margin.Left - Dims.Margin.Right;
    Dims.MainSvgChart.Height = Dims.MainSvg.Height - Dims.Margin.Top - Dims.Margin.Bottom;
}

function setLayoutSizings() {
    d3.select("svg#svg-main")
        .attr("width", Dims.MainSvg.Width)
        .attr("height", Dims.MainSvg.Height); 
           
    d3.select("#main-chart-grp")
        .attr("transform", `translate(${Dims.Margin.Left},${Dims.Margin.Top})`);
    
    d3.select("#navigation-grp")
        .attr("transform", `translate(${Dims.MainSvg.Width - Dims.NavigationBox.Width - Dims.Margin.Right}, ${0})`);
}

function addNavigationControls() {
    d3.select(".navig-home-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-home-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-home-ctrl").attr("stroke", "red");
        })
        .on("click", function() {
            window.location.href = "index.html";
        });    

    d3.select(".navig-next-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-next-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-next-ctrl").attr("stroke", "red");
        })
        .on("click", function() { 
            window.location.href = "USStateCovidCasesGeoMap.html?mode=newCases";
        });                   
}

function renderBackground() {

    var cbGrp1 = buildCoronaBubbleGroups(Dims.MainSvg.Width/2, Dims.MainSvg.Height/2);
    var cbGrp2 = buildCoronaBubbleGroups(100, 100);

    renderCoronaBubbles(cbGrp1);
    renderCoronaBubbles(cbGrp2);

    d3.select("#background-corona-bubbles").lower();

    bubbleAnimate();
}

function buildCoronaBubbleGroups(x, y) {
    return d3.select("#background-corona-bubbles")
            .append("g")
            .attr("class", "background-corona-bubble-grp-p-p")
            .attr("transform", `translate(${x}, ${y})`)
            .append("g")
            .attr("class", "background-corona-bubble-grp-p")        
            .append("g")
            .attr("class", "background-corona-bubble-grp");    
}

function renderCoronaBubbles(selection) {
    selection.selectAll("path")
                .data(dataCoronaSvgPaths)
                .enter()
                .append("path")
                .attr("d", function (d) {
                    return d;
                });
}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

var bubbleAnimate = function() {
    d3.selectAll(".background-corona-bubble-grp-p")
    .transition()
    .duration(randomInteger(10000, 20000))
    .attrTween("transform", function () {
        var dir = (Math.random() > 0.5) ? 1 : -1;    
        return function(t) {
            var rx = d3.select(this).node().getBBox().width/2;
            var ry = d3.select(this).node().getBBox().height/2;  
            return `rotate(${t * 180 * dir} ${rx} ${ry})`;
        };
    })
    .on("end", bubbleAnimate);     
}