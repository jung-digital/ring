import RingaObject from './RingaObject';
import ErrorStackParser from 'error-stack-parser';
import {ringaEventToDebugString} from './util/debug';
import {isDOMNode} from './util/type';
import {getArgNames} from './util/function';
import {buildArgumentsFromRingaEvent} from './util/executors';

export let eventIx = {
  count: 0
};

/**
 * RingaEvent is a generic event type for Ringa that, when dispatched on the DOM, wraps a CustomEvent:
 *
 *   let event = new RingaEvent('change', {
 *     property: 'index',
 *     newValue: 1
 *   });
 *
 *   event.dispatch(...add a bus or DOM node here...);
 *
 * If no bus is provided and document is defined, the event will be dispatched on the document object, but you can provide
 * a custom DOMNode or bus to dispatch from:
 *
 *   event.dispatch(myDiv);
 *
 * OR
 *
 *   let b = new Ringa.Bus();
 *   event.dispatch(b);
 *
 * All RingaEvents bubble and are cancelable by default but this can be customized.
 */
class RingaEvent extends RingaObject {
  //-----------------------------------
  // Constructor
  //-----------------------------------
  /**
   * Build a RingaEvent that wraps a CustomEvent internally.
   *
   * @param type The event type.
   * @param detail Event details object. Note that properties on the RingaEvent in the details object are injected by name
   *               into any executors this triggers, making passing values super controller.
   * @param bubbles True if you want the event to bubble (default is true).
   * @param cancelable True if you want the event to be cancellable (default is true).
   * @param event If an event triggered this one, then this will be set (e.g. a DOM Event like 'click' or 'resize')
   */
  constructor(type, detail = {}, bubbles = true, cancelable = true, event = undefined, requireCatch = true) {
    // TODO add cancel support and unit tests!
    super(`RingaEvent[${type}, ${eventIx.count++}]`);

    if (__DEV__ && !type) {
      throw new Error('RingaEvent: attempting to dispatch an event with an undefined type! This normally happens because the Controller static property you are using is being used before the Controller has been instantiated.');
    }

    this.detail = detail;
    detail.ringaEvent = this;

    this._type = type;
    this._bubbles = bubbles;
    this._cancelable = cancelable;

    this.dispatched = false;
    this.controller = undefined;

    this._errors = undefined;

    this.requireCatch = requireCatch;

    this.event = event;

    this.listeners = {};
    this.dispatchedEvents = [];

    // Controllers that are currently handling the event
    this.catchers = [];
    // Controllers that are done handling the event
    this._catchers = [];
    // Was this event caught at all?
    this.__caught = false;

    this._threads = [];

    this.killed = false;

    // We keep track of when an Event triggered a thread that timed out because if one event triggers another triggers
    // another and the deepest one times out, we don't really need to get a timeout for all the parent ones that are
    // waiting as well.
    this._threadTimedOut = false;
  }

  //-----------------------------------
  // Properties
  //-----------------------------------
  get type() {
    return this._type;
  }

  get bubbles() {
    return this._bubbles;
  }

  get cancelable() {
    return this._cancelable;
  }

  get target() {
    if (this._target) {
      return this._target;
    }

    return this.customEvent ? this.customEvent.target : undefined;
  }

  set target(value) {
    this._target = value;
  }

  get currentTarget() {
    return this.customEvent ? this.customEvent.currentTarget : undefined;
  }

  get errors() {
    return this._errors;
  }

  get caught() {
    return this.__caught;
  }

  /**
   * Returns an Array of every Controller that ran as a result of this event.
   * @private
   */
  get _controllers() {
    return this._catchers.concat(this.catchers);
  }

  /**
   * Returns an Array of every single executor that ran (or will ran) as a result of this event, in order of execution.
   * @private
   */
  get _executors() {
    this.threads.reduce((a, thread) => {
      a = a.concat()
    }, []);
  }

  /**
   * When debug is true (or a number) this outputs verbose information about the event that was dispatched both
   * to the console AND to detail.$debug Object.
   *
   * @returns {{}|*|boolean}
   */
  get debug() {
    return this.detail && this.detail.debug;
  }

  /**
   * Sets the last promise result of this particular event.
   *
   * @param value
   */
  set lastPromiseResult(value) {
    this._lastPromiseResult = value;
  }

  /**
   * Gets the last promise result of this event. If this event triggered another event, then returns that events
   * lastPromiseResult. Hence this method is recursive.
   *
   * @returns {*} A Promise result.
   */
  get lastPromiseResult() {
    if (this._lastPromiseResult) {
      return this._lastPromiseResult;
    }

    if (this.lastEvent) {
      return this.lastEvent.lastPromiseResult;
    }

    return undefined;
  }

  /**
   * Sets the last promise error of this particular event.
   *
   * @param value
   */
  set lastPromiseError(value) {
    this._lastPromiseError = value;
  }

  /**
   * Gets the last promise error of this event. If this event triggered another event, then returns that events
   * lastPromiseError. Hence this method is recursive.
   *
   * @returns {*} A Promise error.
   */
  get lastPromiseError() {
    if (this._lastPromiseError) {
      return this._lastPromiseError;
    }

    if (this.lastEvent) {
      return this.lastEvent.lastPromiseError;
    }

    return undefined;
  }

  get debugHistory() {
    let eventController = this.controllers && this.controllers.length ? this.controllers[0].name : 'Uncaught event';
    let lastEventInfo = this.detail && this.detail.lastEvent ? ' <- ' + this.detail.lastEvent.debugHistory : '';

    return eventController + ':' + this.type + lastEventInfo;
  }

  //-----------------------------------
  // Methods
  //-----------------------------------
  /**
   * Dispatch the event on the provided bus.
   *
   * @param bus
   */
  dispatch(bus = document) {
    if (__DEV__ && this.dispatched) {
      throw Error('RingaEvent::dispatch(): events should only be dispatched once!', this);
    }

    if (__DEV__ || this.detail.debug) {

      // The current version of error-stack-parser throws an error if it
      // fails to parse the given Error object. We don't really want this to
      // cause a fatal error, so we'll just wrap it in a try/catch.
      // TODO: might want to console.warn() about this.

      try { this.dispatchStack = ErrorStackParser.parse(new Error()); }
      catch(err) { this.dispatchStack = []; }

      this.dispatchStack.shift(); // Remove a reference to RingaEvent.dispatch()

      if (this.dispatchStack.length && this.dispatchStack[0].toString().search('Object.dispatch') !== -1) {
        this.dispatchStack.shift(); // Remove a reference to Object.dispatch()
      }

    } else {
      this.dispatchStack = 'To turn on stack traces, build Ringa in development mode. See documentation.';
    }

    if (isDOMNode(bus)) {
      try {
        this.customEvent = new CustomEvent(this.type, {
          detail: this.detail,
          bubbles: this.bubbles,
          cancelable: this.cancelable
        });
      }
      catch(err) {

        // 'new CustomEvent()' will throw an error on IE <= 11.
        // See http://caniuse.com/#search=customevent for more info.
        // The code below ensures compatibility with IE >= 9.

        this.customEvent = document.createEvent('CustomEvent');
        this.customEvent.initCustomEvent(this.type, this.bubbles, this.cancelable, this.detail);
      }
    }

    this.dispatched = true;

    this.addDebug(`Dispatching on ${bus} ${this.customEvent ? 'as custom event.' : 'as RingaEvent.'} (${this.bubbles ? 'bubbling' : 'does not bubble'})`);

    bus.dispatchEvent(this.customEvent ? this.customEvent : this);

    if ((__DEV__ || this.detail.debug) && this.requireCatch && !this.caught) {
      console.warn(`RingaEvent::dispatch(): the RingaEvent '${this.type}' was never caught! Did you dispatch on the proper bus or DOM node? Was dispatched on: `, bus, `and the event was: `, this);
    }

    return this;
  }

  /**
   * Called by each Controller when the event is caught. Note that a single RingaEvent can be caught by 0 or more Controllers.
   *
   * @param controller The Ringa.Controller that is announcing it caught the event.
   * @private
   */
  _caught(controller) {
    if (__DEV__ && !controller) {
      throw new Error('RingaEvent::_caught(): controller was not defined!');
    }

    this.__caught = true;
    this.catchers.push(controller);

    this.addDebug(`Caught by ${controller}`);
  }

  /**
   * Called by a particular controller when the Thread(s) this event triggered in that controller have been completed.
   *
   * @param controller The Ringa.Controller that is announcing it is uncatching the event.
   * @private
   */
  _uncatch(controller) {
    let ix = this.catchers.indexOf(controller);

    if (__DEV__ && ix === -1) {
      throw new Error('RingaEvent::_uncatch(): controller that is uncatching could not be found. Was done called twice?');
    }

    this._catchers.push(this.catchers.splice(ix, 1)[0]);

    this.addDebug(`Uncaught by ${controller}`);
  }

  /**
   * Completely kills the current Ringa thread, keeping any subsequent executors from running. To be called by user code like so:
   *
   *   let event = Ringa.dispatch('someEvent');
   *   ...
   *   event.fail();
   */
  fail(error) {
    // TODO this should have a kill property passed in, and when true should kill *every* associated thread this event triggered (DISCUSS)
    this.pushError(error);
  }

  /**
   * Internal fail to be called by a catching Ringa.Controller when an executor has failed for any reason.
   *
   * @param controller The Controller who is responsible for the Thread that just failed.
   * @param error Most likely an Error object but could be a string or anything a user manually passed.
   * @private
   */
  _fail(controller, error, killed) {
    if (killed) {
      this._uncatch(controller);
    }

    this.addDebug('Fail');

    this._dispatchEvent(RingaEvent.FAIL, undefined, error, killed);
  }

  /**
   * Add an error to this event.
   *
   * @param error Any type of error (string, Error, etc.)
   */
  pushError(error) {
    // TODO we need to add tests for this.
    this._errors = this._errors || [];
    this.errors.push(error);
  }

  /**
   * Internal done called by a handling Ringa.Controller. Note that since multiple Controllers can handle a single
   * event we have to listen for when all the handling Controllers have been completed before announcing we are, indeed,
   * done.
   *
   * @param controller The Controller that is announcing it is done.
   * @private
   */
  _done(controller) {
    if (__DEV__ && !controller) {
      throw new Error('RingaEvent::_done(): controller is not defined!');
    }

    this._uncatch(controller);

    this.addDebug('Done');

    // TODO add unit tests for multiple handling controllers and make sure all possible combinations work (e.g. like
    // one controller fails and another succeeds.
    if (this.catchers.length === 0) {
      if (this.errors && this.errors.length) {
        this._dispatchEvent(RingaEvent.FAIL, undefined, error);
      } else {
        this._dispatchEvent(RingaEvent.DONE);
      }
    }
  }

  /**
   * Each RingaEvent is itself a dispatcher. This is the internal method that should be called to announce an event to
   * things that are listening to this event. Note this is not to be confused with dispatch() which dispatches this event
   * on a bus.
   *
   * @param type Event type.
   * @param detail Details.
   * @param error And error, if there is one.
   * @private
   */
  _dispatchEvent(type, detail, error, kill) {
    let listeners = this.listeners[type];

    this.dispatchedEvents.push({
      type,
      detail,
      error
    });

    if (listeners) {
      listeners.forEach((listener) => {
        listener({
          type,
          detail,
          error,
          kill
        });
      });
    }
  }

  /**
   * Add a listener for either RingaEvent.DONE or RingaEvent.FAIL for when the CommandThread that
   * was triggered by this event has completed.
   *
   * @param eventType
   * @param handler
   */
  addListener(eventType, handler) {
    if (__DEV__ && typeof eventType !== 'string') {
      throw Error('RingaEvent::addListener(): invalid eventType provided!' + eventType);
    }

    this.listeners[eventType] = this.listeners[eventType] || [];

    if (this.listeners[eventType].indexOf(handler) !== -1) {
      throw Error('RingaEvent::addListener(): the same function was added as a listener twice');
    }

    this.listeners[eventType].push(handler);

    this.dispatchedEvents.forEach(_dispatched => {
      if (_dispatched.type === eventType) {
        handler(_dispatched);
      }
    });

    return this;
  }

  /**
   * Listen for when every single Thread that is triggered by this event is done.
   *
   * @param handler A function callback.
   * @returns {*}
   */
  addDoneListener(handler) {
    // TODO add unit tests for multiple controllers handling a thread
    return this.addListener(RingaEvent.DONE, () => {
      let argNames = getArgNames(handler);
      let args = buildArgumentsFromRingaEvent(undefined, argNames, this);
      handler.apply(undefined, args);
    });
  }

  /**
   * Listen for when any thread triggered by this event has a failure.
   *
   * @param handler A function callback.
   *
   * @returns {*}
   */
  addFailListener(handler) {
    // TODO add unit tests for multiple controllers handling a thread
    return this.addListener(RingaEvent.FAIL, handler);
  }

  /**
   * Treat this event like a Promise, in that when it has completed all its triggered threads, it will call resolve or
   * when any thread has a failure, it will call reject.
   *
   * @param resolve A function to call when all triggered threads have completed.
   * @param reject A function to call when any triggered thread has a failure.
   */
  then(resolve, reject) {
    // TODO need to add resolution if then is added AFTER the event has already completed!
    if (resolve) {
      this.addDoneListener(resolve);
    }

    if (reject) this.addFailListener(reject);

    return this;
  }

  /**
   * Treat this event like a Promise. Catch is called when any triggered thread has a failure.
   *
   * @param reject A function to call when any triggered thread has a failure.
   */
  catch(reject) {
    // TODO need to add resolution if then is added AFTER the event has already completed!

    this.addFailListener(reject);

    return this;
  }

  /**
   * Outputs a pretty-printed outline of the entire state of all threads this event has triggered, every executor and its
   * current state (NOT STARTED, RUNNING, DONE, or FAILED).
   *
   * @returns {string} A string of all the data, pretty printed.
   */
  toDebugString() {
    return ringaEventToDebugString(this);
  }

  /**
   * Converts this event to a pretty string with basic information about the event.
   *
   * @returns {string}
   */
  toString() {
    return `${this.id}['${this.type}' caught by ${this._controllers ? this._controllers.toString() : 'nothing yet.'} ] `;
  }

  /**
   * Add a debugging message to this RingaEvent for when a user sets RingaEvent::detail.debug to true OR
   * a numeric level value.
   *
   * @param message The message to output.
   * @param level The numeric level of the message. Default is 0.
   */
  addDebug(message, level = 0) {
    if (this.debug === undefined) {
      return;
    }

    if (typeof this.debug === 'number') {
      if (level <= this.debug) {
        return;
      }
    }

    let obj = {
      timestamp: new Date(),
      stack: ErrorStackParser.parse(new Error()),
      message: message
    };

    console.log(`[RingaEvent '${this.type}' Debug] ${message}`, obj);

    this.detail.$debug = this.detail.$debug || [];
    this.detail.$debug.push(message);
  }

  /**
   * A controller output of the most relevant features of this RingaEvent. Useful for console display.
   *
   * @returns {{type: *, detail: ({}|*), controllers: Array, bubbles: *, dispatchStack: (*|string), fullEvent: RingaEvent}}
   */
  debugDisplay() {
    return {
      type: this.type,
      detail: this.detail,
      controllers: this.catchers,
      bubbles: this.bubbles
    };
  }
}

RingaEvent.DONE = 'done';
RingaEvent.FAIL = 'fail';
RingaEvent.PREHOOK = 'prehook';

export default RingaEvent;
