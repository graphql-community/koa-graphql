/* eslint-disable no-console */

require('babel-register')({
  plugins: [ 'transform-async-to-generator', 'transform-runtime' ]
});

process.on('unhandledRejection', function (error) {
  console.error('Unhandled Promise Rejection:');
  console.error(error && error.stack || error);
});
