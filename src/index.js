const format = require('./format/index.js');
const dummy = require('./dummy/index.js');
const series = require('./subs/series.js');
const movies = require('./subs/movies.js');

module.exports = {
  ...format,
  ...dummy,
  ...series,
  ...movies,
};
