/**
 * This method is used for injecting RingaEvent.detail properties into a function owned by a Executor. It uses the data
 * gathered from introspecting a provided function to determine a set of arguments to
 * call the function with. It maps everything on ringaEvent.detail to arguments on the function.
 *
 * If our function is:
 *
 *    execute(user, filter) {...}
 *
 *  Then expectedArguments should be ['user', 'filter']
 *
 *  To generate the expected arguments, see util/function.js::getArgNames.
 *
 * We want to find ringaEvent.detail['user'] and ringaEvent.detail['filter']
 * and pass those through and error if one of them is missing.
 *
 * Note that there are other properties that can be requested in the arguments list of execute:
 *
 * controller: the Controller object that is handling this thread
 * commandThread: the CommandThread object that built this Command
 * ringaEvent: the ringaEvent itself (instead of one of its detail properties)
 * customEvent: the customEvent that is wrapped by the ringaEvent that was used to bubble up the DOM
 * target: the target DOMNode that triggered the customEvent was dispatched on.
 * done: the parent Executor::done(). CommandFunction is an example of where this is needed.
 * fail: the parent Executor::fail(). CommandFunction is an example of where this is needed.
 *
 * @param executor The Executor subclass instance.
 * @param expectedArguments An array of argument names that the target function expects.
 * @param ringaEvent An instance of RingaEvent that has been dispatched and contains a details Object with properties to be injected.
 *
 * @returns {Array}
 */
export const buildArgumentsFromRingaEvent = function(executor, expectedArguments, ringaEvent) {
  let args = [];

  if (!(expectedArguments instanceof Array)) {
    throw Error('buildArgumentsFromRingaEvent(): An internal error has occurred in that expectedArguments is not an Array!');
  }

  let injections = executor._injections = executor._injections || {
      $controller: executor.controller,
      $thread: executor.thread,
      $ringaEvent: ringaEvent,
      $customEvent: ringaEvent.customEvent,
      $target: ringaEvent.target,
      $detail: ringaEvent.detail,
      done: executor.done,
      fail: executor.fail,
      $lastPromiseResult: ringaEvent.lastPromiseResult,
      $lastPromiseError: ringaEvent.lastPromiseError,
    };

  // Merge controller.options.injections into our injector
  for (var key in executor.controller.options.injections) {
    injections[key] = executor.controller.options.injections[key];
  }

  expectedArguments.forEach((argName) => {
    if (ringaEvent.detail && ringaEvent.detail.hasOwnProperty(argName)) {
      args.push(ringaEvent.detail[argName]);
    } else if (injections.hasOwnProperty(argName)) {
      args.push(injections[argName]);
    } else {
      let message = executor.toString() +
      ': the property \'' +
      argName +
      '\' was not provided on the dispatched ringaEvent.' +
      'Expected Arguments were: [\'' + expectedArguments.join('\'.\'') +
      '\'] Dispatched from: ' +
        (ringaEvent.dispatchStack ? ringaEvent.dispatchStack[0] : 'unknown stack.');

      throw Error(message);
    }
  });

  return args;
};