module.exports = {
  presets: [['@babel/preset-env', { targets: { node: '12' } }]],
  plugins: [
    './resources/load-staticly-from-npm.js',
    '@babel/plugin-transform-flow-strip-types',
  ],
  overrides: [
    {
      include: ['**/__tests__/**/*'],
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    },
  ],
};
