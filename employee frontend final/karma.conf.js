// karma.conf.js
module.exports = function (config) {
  const isCI = process.env.CI === 'true';

  // If CHROME_BIN is not set in the environment, try known paths
  if (!process.env.CHROME_BIN) {
    process.env.CHROME_BIN =
      '/usr/bin/chromium' ||
      '/usr/bin/chromium-browser';
  }

  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-junit-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      clearContext: false,
    },
    
    reporters: isCI
      ? ['progress', 'junit', 'coverage']
      : ['progress', 'kjhtml'],

    // JUnit reporter configuration for Jenkins
    junitReporter: {
      outputDir: 'test-results',
      outputFile: 'unit.xml',
      useBrowserName: false,
      suite: 'frontend',
    },

    // Coverage reporter configuration
    coverageReporter: {
      dir: require('path').join(__dirname, 'coverage'),
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcov' },
        { type: 'cobertura' }
      ],
      fixWebpackSourcePaths: true,
    },

    // Browser configuration
    browsers: isCI ? ['ChromeHeadlessNoSandbox'] : ['Chrome'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--headless',
          '--remote-debugging-port=9222',
        ],
      },
    },

    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: !isCI,
    singleRun: isCI,
    concurrency: Infinity,
    browserNoActivityTimeout: 30000,
    browserDisconnectTimeout: 10000,
    browserDisconnectTolerance: 3,
    captureTimeout: 120000,
  });
};