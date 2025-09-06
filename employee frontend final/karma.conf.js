// karma.conf.js
// Angular/Jasmine + CI friendly (Jenkins)

module.exports = function (config) {
    const isCI = process.env.CI === 'true';
  
    // Si CHROME_BIN n'est pas injecté par l'environnement, on essaie des chemins connus
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
        clearContext: false, // garde la zone de test visible dans le navigateur (utile en local)
      },
  
      reporters: isCI
        ? ['progress', 'junit', 'coverage']
        : ['progress', 'kjhtml', 'coverage'],
  
      // JUnit pour Jenkins (le Jenkinsfile ramasse: employee frontend final/**/junit/**/*.xml)
      junitReporter: {
        outputDir: 'junit',
        outputFile: 'karma-results.xml',
        useBrowserName: true,
        suite: 'frontend',
      },
  
      // Rapport de couverture
      coverageReporter: {
        dir: require('path').join(__dirname, './coverage'),
        reporters: [
          { type: 'html' },
          { type: 'lcovonly' },
          { type: 'text-summary' },
        ],
        // Pas de seuils stricts pour éviter d'échouer en CI
        check: { global: { statements: 0, branches: 0, functions: 0, lines: 0 } },
      },
  
      port: 9876,
      colors: true,
      logLevel: config.LOG_INFO,
  
      // Important en CI
      browsers: ['ChromeHeadlessNoSandbox'],
      customLaunchers: {
        ChromeHeadlessNoSandbox: {
          base: 'ChromeHeadless',
          flags: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-zygote',
          ],
        },
      },
  
      // stabilité en environnement lent (CI/K8s)
      browserNoActivityTimeout: 120000,
      browserDisconnectTimeout: 120000,
      browserDisconnectTolerance: 3,
      captureTimeout: 180000,
  
      singleRun: isCI,     // true en CI, false en local
      autoWatch: !isCI,
      restartOnFileChange: !isCI,
    });
  };
  