'use strict';

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

require('dotenv').config();

const PORT = process.env.PORT || 3000;
const app = express();

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err => console.log(err));

app.use(cors());
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});

// Error Handler
function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('This location is not a valid input');
}

// Requests location data
app.get('/location', (req, res) => {
  searchToLatLong(req.query.data).then(location => res.send(location)).catch(error => handleError(error, res));
});

// Requests weather data
app.get('/weather', getWeather);

// Requests restaurant data
app.get('/yelp', getRestaurants);

// Requests movie data
app.get('/movies', getMovies);

// Location constructor
function Location(query, res) {
  this.formatted_query = res.body.results[0].formatted_address;
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.search_query = query;
}

// Weather constructor
function Weather(day) {
  this.forecast = day.summary;
  this.current_time = new Date(day.time * 1000).toDateString();
}

// Restaurant constructor for Yelp
function Restaurant(business) {
  this.name = business.name;
  this.image_url = business.image_url;
  this.price = business.price;
  this.rating = business.rating;
  this.url = business.url;
}

// Movie data constructor
function Movie(data) {
  this.title = data.title;
  this.overview = data.overview;
  this.average_votes = data.vote_average;
  this.total_votes = data.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/w200_and_h300_bestv2/${data.poster_path}`;
  this.popularity = data.popularity;
  this.released_on = data.release_date;
}

// Helper function for location
function searchToLatLong(query) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(url).then(res => {
    return new Location(query, res)
  }).catch(error => handleError(error));
}

// Helper function for weather
function getWeather(req, res) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;

  superagent.get(url).then(result => {
    const weatherSummaries = result.body.daily.data.map(day => {
      return new Weather(day);
    });
    res.send(weatherSummaries);
  }).catch(error => handleError(error));
}

// Helper function for Yelp
function getRestaurants(req, res) {
  const url = `https://api.yelp.com/v3/businesses/search?location=${req.query.data.search_query}`;

  superagent.get(url).set('Authorization', `Bearer ${process.env.YELP_API_KEY}`).then(result => {
    const yelpInfo = result.body.businesses.map(business => {
      return new Restaurant(business);
    });
    res.send(yelpInfo);
  }).catch(error => handleError(error));
}

// Helper function for movies
function getMovies(req, res) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIEDB_API_KEY}&query=${req.query.data.search_query}`;

  superagent.get(url).then(result => {
    const movieData = result.body.results.map(data => {
      return new Movie(data);
    });
    res.send(movieData);
  }).catch(error => handleError(error));
}
