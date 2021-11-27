module.exports = {
  presets: [['@babel/preset-env', { targets: { node: '12' } }]],
  plugins: [
    './resources/load-statically-from-npm.js',
  ],
  overrides: [
    {
      include: ['**/__tests__/**/*'],
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    },
  ],
};
