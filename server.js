'use strict';

// Adds dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

// Loads environment variables
require('dotenv').config();

// Sets up app constants
const PORT = process.env.PORT || 3000;
const app = express();

// Sets up database
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err => console.log(err));

// Allows public access to API
app.use(cors());

// Starts the server
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});

// Error Handler
function handleError(err, res) {
  console.error('ERROR', err);
  if (res) res.status(500).send('This location is not a valid input');
}

// Requests location data
app.get('/location', getLocation);

// Requests weather data
app.get('/weather', getWeather);

// Requests restaurant data
app.get('/yelp', getRestaurants);

// Requests movie data
app.get('/movies', getMovies);


// Location constructor
function Location(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}
// Saves location to the database
Location.prototype.save = function() {
  let SQL = `
    INSERT INTO locations
      (search_query, formatted_query, latitude, longitude) 
      VALUES($1,$2,$3,$4) 
      RETURNING id;
  `;
  let values = Object.values(this);
  console.log(values);
  return client.query(SQL,values);
};

// Gets location from db cahce or makes request to fetch from API
function getLocation(req, res) {
  const locationHandler = {
    query: req.query.data,
    cacheHit: (results) => {
      console.log('Got location data from SQL');
      res.send(results.rows[0]);
    },
    cacheMiss: () => {
      Location.fetchLocation(req.query.data).then(data => res.send(data));
    },
  };
  Location.lookupLocation(locationHandler);
}

// Fetches location from the API and saves to the database
Location.fetchLocation = (query) => {
  const _URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(_URL).then(data => {
    console.log('Got location data from the API', data.body.results);
    // If no results from API
    if (!data.body.results.length) {throw 'No data';}
    else {
      // Creates an instance and saves to database
      let location = new Location(query, data.body.results[0]);
      return location.save().then(result => {
        location.id = result.rows[0].id;
        return location;
      });
      return location;
    }
  });
};

// Looks up location from database
Location.lookupLocation = (handler) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [handler.query];

  return client.query(SQL, values).then(results => {
    if (results.rowCount > 0) {
      handler.cacheHit(results);
    } else {
      handler.cacheMiss();
    }
  }).catch(error => handleError(error));
};


// Weather constructor
function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toDateString();
}
// Saves weather to db
Weather.prototype.save = function(id) {
  const SQL = `INSERT INTO weathers (forecast, time, location_id) VALUES ($1, $2, $3);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};

// Gets weather from db cahce or makes request to fetch from API
function getWeather(req, res) {
  const weatherHandler = {
    location: req.query.data,
    cacheHit: (result) => {
      res.send(result.rows);
    },
    cacheMiss: () => {
      Weather.fetchWeather(req.query.data).then(results => res.send(results)).catch(error => handleError(error));
    },
  };
  Weather.lookupWeather(weatherHandler);
}

// Fetches weather from the API and saves to the database
Weather.fetchWeather = function(location) {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${location.latitude},${location.longitude}`;

  return superagent.get(url).then(result => {
    const weatherSummaries = result.body.daily.data.map(day => {
      const summary = new Weather(day);
      summary.save(location.id);
      return summary;
    });
    return weatherSummaries;
  });
};

// Looks up weather from database
Weather.lookupWeather = function(handler) {
  const SQL = `SELECT * FROM weathers WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id]).then(result => {
    if(result.rowCount > 0) {
      console.log('Got weather data from SQL');
      handler.cacheHit(result);
    } else {
      console.log('Got weather data from API');
      handler.cacheMiss();
    }
  }).catch(error => handleError(error));
};



// Restaurant constructor for Yelp
function Restaurant(business) {
  this.name = business.name;
  this.image_url = business.image_url;
  this.price = business.price;
  this.rating = business.rating;
  this.url = business.url;
}

// Saves restaurants to db
Restaurant.prototype.save = function(id) {
  const SQL = `INSERT INTO restaurants (name, image_url, price, rating, url, location_id) VALUES ($1, $2, $3, $4, $5, $6);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};

// Gets restaurants from db cahce or makes request to fetch from API
function getRestaurants(req, res) {
  const restaurantHandler = {
    location: req.query.data,
    cacheHit: (result) => {
      res.send(result.rows);
    },
    cacheMiss: () => {
      Restaurant.fetchRestaurant(req.query.data).then(results => res.send(results)).catch(error => handleError(error));
    },
  };
  Restaurant.lookupRestaurant(restaurantHandler);
}

// Fetches restautants from the API and saves to the database
Restaurant.fetchRestaurant = function(location) {
  const url = `https://api.yelp.com/v3/businesses/search?location=${location.search_query}`;

  return superagent.get(url).set('Authorization', `Bearer ${process.env.YELP_API_KEY}`).then(result => {
    const businesses = result.body.businesses.map(place => {
      const business = new Restaurant(place);
      business.save(location.id);
      return business;
    });
    return businesses;
  });
};

// Looks up restuarants from database
Restaurant.lookupRestaurant = function(handler) {
  const SQL = `SELECT * FROM restaurants WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id]).then(result => {
    if(result.rowCount > 0) {
      console.log('Got restaurant data from SQL');
      handler.cacheHit(result);
    } else {
      console.log('Got restaurant data from API');
      handler.cacheMiss();
    }
  }).catch(error => handleError(error));
};


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
// Saves movies to db
Movie.prototype.save = function(id) {
  const SQL = `INSERT INTO movies (title, overview, average_votes, total_votes, image_url, popularity, released_on, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`;
  const values = Object.values(this);
  values.push(id);
  client.query(SQL, values);
};

// Gets movies from db cahce or makes request to fetch from API
function getMovies(req, res) {
  const movieHandler = {
    location: req.query.data,
    cacheHit: (result) => {
      res.send(result.rows);
    },
    cacheMiss: () => {
      Movie.fetchMovies(req.query.data).then(results => res.send(results)).catch(error => handleError(error));
    },
  };
  Movie.lookupMovies(movieHandler);
}

// Fetches movies from the API and saves to the database
Movie.fetchMovies = function(location) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIEDB_API_KEY}&query=${location.search_query}`;

  return superagent.get(url).then(result => {
    const movieData = result.body.results.map(data => {
      const movie = new Movie(data);
      movie.save(location.id);
      return movie;
    });
    return movieData;
  });
};

// Looks up weather from database
Movie.lookupMovies = function(handler) {
  const SQL = `SELECT * FROM movies WHERE location_id=$1;`;
  client.query(SQL, [handler.location.id]).then(result => {
    if(result.rowCount > 0) {
      console.log('Got movie data from SQL');
      handler.cacheHit(result);
    } else {
      console.log('Got movie data from API');
      handler.cacheMiss();
    }
  }).catch(error => handleError(error));
};
