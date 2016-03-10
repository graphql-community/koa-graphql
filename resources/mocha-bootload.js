/* eslint-disable no-console */

require('babel/register')({
  ignore: /node_modules/,
  optional: [ 'asyncToGenerator' ]
});

process.on('unhandledRejection', function (error) {
  console.error('Unhandled Promise Rejection:');
  console.error(error && error.stack || error);
});
