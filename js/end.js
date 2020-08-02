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

computeDims();

setLayoutSizings();

drawStory();

function drawStory() {
    init();
    addNavigationControls();
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

    d3.select(".navig-prev-ctrl-grp")
        .on("mousemove", function() {
            d3.select(".navig-prev-ctrl").attr("stroke", "yellow");
        })
        .on("mouseout", function() {
            d3.select(".navig-prev-ctrl").attr("stroke", "red");
        })
        .on("click", function() { 
            window.location.href = "USStateCovidRollingAverage.html?mode=deaths";
        });                   
}