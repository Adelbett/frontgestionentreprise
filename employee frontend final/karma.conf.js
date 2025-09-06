// karma.conf.js
// Karma configuration file, see link for more information
// https://karma-runner.github.io/1.0/config/configuration-file.html

module.exports = function (config) {
  const isCI = process.env.CI === 'true';

  // If CHROME_BIN is not set in the environment, try known paths
  if (!process.env.CHROME_BIN) {
    process.env.CHROME_BIN =
      '/usr/bin/chromium' ||
      '/usr/bin/chromium-browser' ||
      process.env.CHROME_BIN;
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
      clearContext: false, // keep test runner visible in browser (useful for local development)
    },
    reporters: isCI
      ? ['progress', 'junit', 'coverage']
      : ['progress', 'kjhtml', 'coverage'],

    // JUnit reporter configuration for Jenkins
    junitReporter: {
      outputDir: 'test-results/karma', // Changed to match Jenkinsfile expectation
      outputFile: 'test-results.xml',
      useBrowserName: true, // creates a file per browser
      suite: 'frontend',
    },

    // Coverage reporter configuration
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcov' },
        { type: 'cobertura' } // Add cobertura format for Jenkins
      ],
      fixWebpackSourcePaths: true,
    },

    // Webpack configuration
    webpack: {
      stats: 'errors-only',
    },

    // Browser configuration
    browsers: isCI ? ['ChromeHeadlessCI'] : ['Chrome'],
    customLaunchers: {
      ChromeHeadlessCI: {
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

    // Test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://www.npmjs.com/search?q=keywords:karma-reporter
    colors: true,

    // Level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // Enable / disable watching file and executing tests whenever any file changes
    autoWatch: !isCI,

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: isCI,

    // Concurrency level
    // how many browser instances should be started simultaneously
    concurrency: Infinity,
  });
};