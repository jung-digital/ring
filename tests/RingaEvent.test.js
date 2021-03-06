/* eslint-disable no-unused-vars */

window.__DEV__ = true;

import TestUtils from 'react-dom/test-utils';
import React from 'react';
import ReactDOM from 'react-dom';
import Ringa, {__hardReset, dispatch} from '../src/index';
import TestController from './shared/TestController';

describe('RingaEvent', () => {
  let command, domNode, reactNode, controller;

  beforeEach(() => {
    domNode = ReactDOM.findDOMNode(TestUtils.renderIntoDocument(
      <div>Controller Attach Point</div>
    ));

    controller = new TestController('testController', domNode, {
      timeout: 500
    });

    controller.options.injections.someInjection = {
      test: 'test'
    };
  });

  afterEach(() => {
    __hardReset();
  });

  //------------------------------------------------
  // Should inject properties into .then() resolve
  //
  // https://github.com/jung-digital/ringa/issues/72
  //------------------------------------------------
  it('Should inject properties into .then() resolve (1/3)', (done) => {
    controller.addListener('event', () => {});

    dispatch('event', domNode).then((someInjection) => {
      expect(someInjection).toEqual({
        test: 'test'
      });
      done();
    });
  }, 50);

  //------------------------------------------------
  // Should inject properties into .then() resolve
  //
  // https://github.com/jung-digital/ringa/issues/72
  //------------------------------------------------
  it('Should inject properties into .then() resolve (2/3)', (done) => {
    controller.addListener('event', () => {});

    dispatch('event', {
      someProp: 'whatever'
    }, domNode).then((someInjection, someProp) => {
      expect(someInjection).toEqual({test: 'test'});
      expect(someProp).toEqual('whatever');
      done();
    });
  }, 50);

  //------------------------------------------------
  // Should inject properties into .then() resolve
  //
  // https://github.com/jung-digital/ringa/issues/72
  //------------------------------------------------
  it('Should inject properties into .then() resolve (3/3)', (done) => {
    controller.addListener('event', () => {});

    dispatch('event', {
      // This should override the one on the controller
      someInjection: 'whatever'
    }, domNode).then((someInjection) => {
      expect(someInjection).toEqual('whatever');
      done();
    });
  }, 50);

  //------------------------------------------------
  // Should inject properties into done handler
  //
  // https://github.com/jung-digital/ringa/issues/72
  //------------------------------------------------
  it('Should inject properties into done (1/3)', (done) => {
    controller.addListener('event', () => {});

    dispatch('event', domNode).addDoneListener((someInjection) => {
      expect(someInjection).toEqual({
        test: 'test'
      });
      done();
    });
  }, 50);

  //------------------------------------------------
  // Should inject properties into done handler
  //
  // https://github.com/jung-digital/ringa/issues/72
  //------------------------------------------------
  it('Should inject properties into done (2/3)', (done) => {
    controller.addListener('event', () => {});

    dispatch('event', {
      someProp: 'whatever'
    }, domNode).addDoneListener((someInjection, someProp) => {
      expect(someInjection).toEqual({test: 'test'});
      expect(someProp).toEqual('whatever');
      done();
    });
  }, 50);

  //------------------------------------------------
  // Should inject properties into done handler
  //
  // https://github.com/jung-digital/ringa/issues/72
  //------------------------------------------------
  it('Should inject properties into done (3/3)', (done) => {
    controller.addListener('event', () => {});

    dispatch('event', {
      // This should override the one on the controller
      someInjection: 'whatever'
    }, domNode).addDoneListener((someInjection) => {
      expect(someInjection).toEqual('whatever');
      done();
    });
  }, 50);

  //------------------------------------------------
  // Should allow a debug property to be set and keep
  // track of Ringa debugging information
  //
  // https://github.com/jung-digital/ringa/issues/78
  //------------------------------------------------
  it('Should have a debug property', (done) => {
    controller.addListener('event', () => {});

    dispatch('event', {
      // This should override the one on the controller
      someInjection: 'whatever'
    }, domNode).addDoneListener((someInjection) => {
      expect(someInjection).toEqual('whatever');
      done();
    });
  }, 50);
});
