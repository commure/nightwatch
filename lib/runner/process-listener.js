const Logger = require('../util/logger.js');

module.exports = class {

  constructor(proc = process) {
    this.__exitCode = 0;
    this.testRunner = null;
    this.process = proc;
    this.finishCallback = null;

    this.process.on('exit', this.onExit.bind(this));
    this.process.on('uncaughtException', err => {
      this.uncaught(err);
    });

    this.process.on('unhandledRejection', this.unhandled.bind(this));
  }

  setTestRunner(testRunner) {
    this.testRunner = testRunner;

    return this;
  }

  setExitCode(code) {
    console.log("process-listener/setExitCode: ", code);
    this.__exitCode = code;

    return this;
  }

  get exitCode() {
    return this.__exitCode;
  }

  onExit(code) {
    console.trace();
    console.log("process-listener/onExit:", code);
    if (code > 0) {
      this.setExitCode(code);
    }

    this.exit();
  }

  unhandled(err) {
    Logger.warn('unhandledRejection:');
    this.uncaught(err);
  }

  getCurrentPromise(err) {
    if (this.testRunner && this.testRunner.currentSuite) {
      this.testRunner.registerUncaughtErr(err);
      this.testRunner.currentSuite.emptyQueue();

      return new Promise((resolve) => {
        let runnable = this.testRunner.currentSuite.currentRunnable;

        if (runnable) {
          runnable.abort(err).then(_ => resolve());
        } else {
          resolve();
        }
      }).then(_ => {
        if (this.testRunner.result) {
          this.testRunner.publishReport = false;

          return Promise.all([
            this.testRunner.closeOpenSessions(),
            this.testRunner.reportResults()
          ]).catch(err => {
            this.testRunner.registerUncaughtErr(err);

            return err;
          });
        }

        return Promise.resolve();
      });
    } else {
      Logger.error(err);
    }

    return Promise.resolve();
  }

  uncaught(err) {
    const WebDriver = require('./webdriver-server.js');

    this.getCurrentPromise(err)
      .then(_ => {
        return WebDriver.stopInstances();
      })
      .then(_ => {
        this.closeProcess(err);
      });
  }

  closeProcess(err) {
    if (this.finishCallback) {
      this.finishCallback(err);
    }

    this.setExitCode(1).exit();
  }

  exit() {
    console.log("process-listener/exit", this.exitCode);
    this.process.exit && this.process.exit(this.exitCode);

    return this;
  }
};
