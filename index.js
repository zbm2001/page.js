/* globals require, module */

'use strict';

/**
 * Module dependencies.
 */

var pathtoRegexp = require('path-to-regexp');

/**
 * Module exports.
 */

module.exports = page;

/**
 * Detect click event
 */
var clickEvent = ('undefined' !== typeof document) && document.ontouchstart ? 'touchstart' : 'click';

/**
 * To work properly with the URL
 * history.location generated polyfill in https://github.com/devote/HTML5-History-API
 */

var location;
var history;

if ('undefined' !== typeof window) {
  history = window.history;
  location = history.location || window.location;
}

/**
 * Perform initial dispatch.
 */

var dispatch = true;


/**
 * Decode URL components (query string, pathname, hash).
 * Accommodates both regular percent encoding and x-www-form-urlencoded format.
 */
var decodeURLComponents = true;

/**
 * Base path.
 */

var base = '';

/**
 * Running flag.
 */

var running;

/**
 * HashBang option
 */

var hashbang = false;

/**
 * Previous context, for capturing
 * page exit events.
 */

var prevContext;

/**
 * Register `path` with callback `fn()`,
 * or route `path`, or redirection,
 * or `page.start()`.
 *
 *   page(fn);
 *   page('*', fn);
 *   page('/user/:id', load, user);
 *   page('/user/' + user.id, { some: 'thing' });
 *   page('/user/' + user.id);
 *   page('/from', '/to')
 *   page();
 *
 * @param {string|!Function|!Object} path
 * @param {Function=} fn
 * @api public
 */

function page (path, fn) {
  // <callback>
  if ('function' === typeof path) {
    return page('*', path);
  }

  // route <path> to <callback ...>
  if ('function' === typeof fn) {
    var route = new Route(/** @type {string} */ (path));
    for (var i = 1; i < arguments.length; ++i) {
      page.callbacks.push(route.middleware(arguments[i]));
    }
    // show <path> with [state]
  } else if ('string' === typeof path) {
    page['string' === typeof fn ? 'redirect' : 'show'](path, fn);
    // start [options]
  } else {
    page.start(path);
  }
}

/**
 * Callback functions.
 */

page.callbacks = [];
page.exits = [];

/**
 * Current path being processed
 * @type {string}
 */
page.current = '';

/**
 * Array of pages navigated to.
 * @type {number}
 *
 *     page.history = [];
 *     page('/login');
 *     page.history == ['/login'];
 */

page.history = [];

/**
 * Get or set basepath to `path`.
 *
 * @param {string} path
 * @api public
 */

page.base = function (path) {
  if (!arguments.length) return base;
  base = path;
};

/**
 * Bind with the given `options`.
 *
 * Options:
 *
 *    - `click` bind to click events [true]
 *    - `popstate` bind to popstate [true]
 *    - `dispatch` perform initial dispatch [true]
 *
 * @param {Object} options
 * @api public
 */

page.start = function (options) {
  options = options || {};
  if (running) return;
  running = true;
  if (false === options.dispatch) dispatch = false;
  if (false === options.decodeURLComponents) decodeURLComponents = false;
  if (false !== options.popstate) window.addEventListener('popstate', onpopstate, false);
  if (false !== options.click) {
    document.addEventListener(clickEvent, onclick, false);
  }
  if (true === options.hashbang) hashbang = true;
  if (!dispatch) return;
  var url = (hashbang && ~location.hash.indexOf('#!')) ? location.hash.substr(2) + location.search : location.pathname + location.search + location.hash;
  page.replace(url, null, true, dispatch);
};

/**
 * Unbind click and popstate event handlers.
 *
 * @api public
 */

page.stop = function () {
  if (!running) return;
  var pageHistory = page.history.slice()
  page.current = '';
  page.history.length = 0;
  running = false;
  document.removeEventListener(clickEvent, onclick, false);
  window.removeEventListener('popstate', onpopstate, false);
  return pageHistory;
};

/**
 * Show `path` with optional `state` object.
 *
 * @param {string} path
 * @param {Object=} state
 * @param {boolean=} dispatch
 * @param {boolean=} push
 * @return {!Context}
 * @api public
 */

page.show = function (path, state, dispatch, noPush) {
  var ctx = new Context(path, state);
  page.current = ctx.path;
  if (false !== dispatch) page.dispatch(ctx);
  console.log('ctx.handled: ', ctx.handled)
  if (!ctx.handled && !noPush) ctx.pushState();
  return ctx;
};

/**
 * Goes back in the history
 * Back should always let the current route push state and then go back.
 *
 * @param {string} path - fallback path to go back if no more history exists, if undefined defaults to page.base
 * @param {Object=} state
 * @api public
 */

// page.back = function(path, state) {
//   if (page.history.length > 0) {
//     // this may need more testing to see if all browsers
//     // wait for the next tick to go back in history
//     history.back();
//     page.history.length--;
//   } else if (path) {
//     setTimeout(function() {
//       page.show(path, state);
//     });
//   } else {
//     setTimeout(function() {
//       page.show(base, state);
//     });
//   }
// };

page.back = function (path, state) {
  var len = page.history.length,
    count = 1,
    index,
    spliceHistory;
  if (len > 0) {
    switch (typeof path) {
      case 'number':
        count = parseInt(path)
        if (count < 1) {
          console.warn('arguments[0] "' + path + '" is less than 1. so do nothing');
          return spliceHistory;
        }
        else if (count > len) {
          console.warn('arguments[0] "' + path + '" is greater than history\'s length. so do nothing');
          return spliceHistory;
        }
        break;
      case 'string':
        index = page.history.indexOf(function (path) {
          return url === path
        });
        if (index < 0) {
          console.warn('history has not path "' + path + '". so do nothing');
          return spliceHistory;
        }
        break;
    }

    // this may need more testing to see if all browsers
    // wait for the next tick to go back in history
    spliceHistory = page.history.splice(-count);
    history.go(-count);
  }
  return spliceHistory;
};

/**
 * Register route to redirect from one path to other
 * or just redirect to another route
 *
 * @param {string} from - if param 'to' is undefined redirects to 'from'
 * @param {string=} to
 * @api public
 */
page.redirect = function (from, to) {
  // Define route from a path to another
  if ('string' === typeof from && 'string' === typeof to) {
    page(from, function (e) {
      setTimeout(function () {
        page.replace(/** @type {!string} */ (to));
      }, 0);
    });
  }

  // Wait for the push state and replace it with another
  if ('string' === typeof from && 'undefined' === typeof to) {
    setTimeout(function () {
      page.replace(from);
    }, 0);
  }
};

/**
 * Replace `path` with optional `state` object.
 *
 * @param {string} path
 * @param {Object=} state
 * @param {boolean=} init
 * @param {boolean=} dispatch
 * @return {!Context}
 * @api public
 */


page.replace = function (path, state, init, dispatch) {
  var ctx = new Context(path, state);
  page.current = ctx.path;
  ctx.init = init;
  ctx.save(); // save before dispatching, which may redirect
  if (false !== dispatch) page.dispatch(ctx);
  return ctx;
};

/**
 * Dispatch the given `ctx`.
 *
 * @param {Context} ctx
 * @api private
 */
page.dispatch = function (ctx) {
  var prev = prevContext,
    i = 0,
    j = 0;

  prevContext = ctx;
  // console.log(prev)
  function nextExit () {
    var fn = page.exits[j++];
    if (!fn) return nextEnter();
    fn(prev, nextExit);
  }

  function nextEnter () {
    var fn = page.callbacks[i++];
    // console.log(ctx.path !== page.current)
    if (ctx.path !== page.current) {
      ctx.handled = false;
      return;
    }
    if (!fn) return unhandled(ctx);
    fn(ctx, nextEnter);
  }

  if (prev) {
    nextExit();
  } else {
    nextEnter();
  }
};

/**
 * Unhandled `ctx`. When it's not the initial
 * popstate then redirect. If you wish to handle
 * 404s on your own use `page('*', callback)`.
 *
 * @param {Context} ctx
 * @api private
 */
function unhandled (ctx) {
  if (ctx.handled) return;
  var current;

  if (hashbang) {
    current = base + location.hash.replace('#!', '');
  } else {
    current = location.pathname + location.search;
  }

  if (current === ctx.canonicalPath) return;
  page.stop();
  ctx.handled = false;
  location.href = ctx.canonicalPath;
}

/**
 * Register an exit route on `path` with
 * callback `fn()`, which will be called
 * on the previous context when a new
 * page is visited.
 */
page.exit = function (path, fn) {
  if (typeof path === 'function') {
    return page.exit('*', path);
  }

  var route = new Route(path);
  for (var i = 1; i < arguments.length; ++i) {
    page.exits.push(route.middleware(arguments[i]));
  }
};

/**
 * Remove URL encoding from the given `str`.
 * Accommodates whitespace in both x-www-form-urlencoded
 * and regular percent-encoded form.
 *
 * @param {string} val - URL component to decode
 */
function decodeURLEncodedURIComponent (val) {
  if (typeof val !== 'string') {
    return val;
  }
  return decodeURLComponents ? decodeURIComponent(val.replace(/\+/g, ' ')) : val;
}

/**
 * Initialize a new "request" `Context`
 * with the given `path` and optional initial `state`.
 *
 * @constructor
 * @param {string} path
 * @param {Object=} state
 * @api public
 */

function Context (path, state) {
  if ('/' === path[0] && 0 !== path.indexOf(base)) path = base + (hashbang ? '#!' : '') + path;
  var i = path.indexOf('?');
  var j;

  this.canonicalPath = path;
  this.path = path.replace(base, '') || '/';
  if (hashbang) this.path = this.path.replace('#!', '') || '/';

  this.title = (typeof document !== 'undefined' && document.title);
  this.state = state || {};
  // this.state.path = path;

  if (i > -1) {
    this.pathname = decodeURLEncodedURIComponent(path.slice(0, i));
    this.querystring = decodeURLEncodedURIComponent(path.slice(i + 1));
    j = this.querystring.indexOf('#');
    if (j > -1) {
      this.search = this.querystring.slice(0, j);
      this.hash = this.querystring.slice(j + 1);
      hashbang || (this.querystring = this.search);
    }
    else {
      this.search = this.querystring;
    }
  }
  else {
    j = path.indexOf('#');
    if (j > -1) {
      this.pathname = decodeURLEncodedURIComponent(path.slice(0, j));
      this.hash = decodeURLEncodedURIComponent(path.slice(j + 1))
    }
    else {
      this.pathname = decodeURLEncodedURIComponent(path);
    }
  }

  this.segments = this.pathname.slice(1).split('/');

  i = this.pathname.lastIndexOf('/');
  if (i > -1) {
    this.dir = this.pathname.slice(0, i);
    this.file = this.pathname.slice(i + 1);
  }
  else {
    this.file = this.pathname;
  }

  j = this.file.lastIndexOf('.');
  if (j > -1) {
    this.filename = this.file.slice(0, j);
    this.fileSuffix = this.file.slice(j + 1);
  }
  else {
    this.filename = this.file;
  }

  this.restParams = {};
  this.params = parseSearch2Params(this.search, true);

  // fragment
  // this.hash = '';
  if (!hashbang) {
    i = this.path.indexOf('#');
    if (i < 0) return;
    // this.hash = decodeURLEncodedURIComponent(this.path.slice(i + 1));
    this.path = this.path.slice(0, i);
    // this.querystring = this.querystring.split('#')[0];
  }
}

Context.prototype.canonicalPath = '';
Context.prototype.path = null;
Context.prototype.title = '';
Context.prototype.state = null;
Context.prototype.querystring = '';
Context.prototype.search = '';
Context.prototype.hash = '';
Context.prototype.pathname = '';
Context.prototype.path = '';
Context.prototype.dir = '/';
Context.prototype.file = '';
Context.prototype.filename = '';
Context.prototype.fileSuffix = '';
Context.prototype.params = null;
Context.prototype.restParams = null;
Context.prototype.segments = null;

function parseSearch2Params (search, undecode) {
  var params = {};
  if (search) {
    search.charAt(0) === '?' && (search = search.slice(1));
    search.split('&').forEach(function (param) {
      var i = param.indexOf('=');
      var name = param.slice(0, i++);
      var value = undecode ? param.slice(i) : decodeURIComponent(param.slice(i));
      var oldValue = this[name];

      switch (typeof oldValue) {
        case 'string':
          this[name] = [oldValue, value];
          return
        case 'undefined':
          this[name] = value;
          return
        case 'object':
          if (oldValue) {
            oldValue.push(value);
          }
          return
      }
    }, params);
  }
  return params;
};

page.parseSearch2Params = parseSearch2Params;

/**
 * Expose `Context`.
 */

page.Context = Context;

/**
 * Push state.
 *
 * @api private
 */

Context.prototype.pushState = function () {
  var url = this.getUrl();
  history.pushState(this.state, this.title, url);
  page.history.push(url);
  console.log('pushState: ', JSON.stringify(page.history))
};

Context.prototype.getUrl = function () {
  return hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath;
};

/**
 * Save the context state.
 *
 * @api public
 */

Context.prototype.save = function () {
  var url = this.getUrl(),
    len = page.history.length;
  history.replaceState(this.state, this.title, url);
  if (len) page.history[len - 1] = url;
};

/**
 * Initialize `Route` with the given HTTP `path`,
 * and an array of `callbacks` and `options`.
 *
 * Options:
 *
 *   - `sensitive`    enable case-sensitive routes
 *   - `strict`       enable strict matching for trailing slashes
 *
 * @constructor
 * @param {string} path
 * @param {Object=} options
 * @api private
 */

function Route (path, options) {
  options = options || {};
  this.path = (path === '*') ? '(.*)' : path;
  this.method = 'GET';
  this.regexp = pathtoRegexp(this.path,
    this.keys = [],
    options);
}

/**
 * Expose `Route`.
 */

page.Route = Route;

/**
 * Return route middleware with
 * the given callback `fn()`.
 *
 * @param {Function} fn
 * @return {Function}
 * @api public
 */

Route.prototype.middleware = function (fn) {
  var self = this;
  return function (ctx, next) {
    if (self.match(ctx.path, ctx.restParams)) return fn(ctx, next);
    next();
  };
};

/**
 * Check if this route matches `path`, if so
 * populate `params`.
 *
 * @param {string} path
 * @param {Object} params
 * @return {boolean}
 * @api private
 */

Route.prototype.match = function (path, params) {
  var keys = this.keys,
    qsIndex = path.indexOf('?'),
    pathname = ~qsIndex ? path.slice(0, qsIndex) : path,
    m = this.regexp.exec(decodeURIComponent(pathname));

  if (!m) return false;

  for (var i = 1, len = m.length; i < len; ++i) {
    var key = keys[i - 1];
    var val = decodeURLEncodedURIComponent(m[i]);
    if (val !== undefined || !(hasOwnProperty.call(params, key.name))) {
      params[key.name] = val;
    }
  }

  return true;
};


/**
 * Handle "populate" events.
 */

var onpopstate = (function () {
  var loaded = false;
  if ('undefined' === typeof window) {
    return;
  }
  if (document.readyState === 'complete') {
    loaded = true;
  } else {
    window.addEventListener('load', function () {
      setTimeout(function () {
        loaded = true;
      }, 0);
    });
  }
  return function onpopstate (e) {
    if (!loaded) return;
    // if (e.state) {
    //   var path = e.state.path;
    //   page.replace(path, e.state);
    // } else {
    //   page.show(location.pathname + location.hash, undefined, undefined, false);
    // }
    console.log('e.state: ', e.state)
    // var path = location.pathname + location.search + location.hash;
    // if (e.state) {
    //   page.replace(path, e.state);
    // } else {
    //   page.current = path
    // }
  };
})();
/**
 * Handle "click" events.
 */

function onclick (e) {

  if (1 !== which(e)) return;

  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  if (e.defaultPrevented) return;


  // ensure link
  // use shadow dom when available
  var el = e.path ? e.path[0] : e.target;
  while (el && 'A' !== el.nodeName) el = el.parentNode;
  if (!el || 'A' !== el.nodeName) return;


  // Ignore if tag has
  // 1. "download" attribute
  // 2. rel="external" attribute
  if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;

  // ensure non-hash for the same path
  var link = el.getAttribute('href');
  if (!hashbang && el.pathname === location.pathname && (el.hash || '#' === link)) return;


  // Check for mailto: in the href
  if (link && link.indexOf('mailto:') > -1) return;

  // check target
  if (el.target) return;

  // x-origin
  if (!sameOrigin(el.href)) return;


  // rebuild path
  var path = el.pathname + el.search + (el.hash || '');
  var rAZ = /^\/[a-zA-Z]:\//;

  // strip leading "/[drive letter]:" on NW.js on Windows
  if (typeof process !== 'undefined' && path.match(rAZ)) {
    path = path.replace(rAZ, '/');
  }

  // same page
  var orig = path;

  if (path.indexOf(base) === 0) {
    path = path.substr(base.length);
  }

  if (hashbang) path = path.replace('#!', '');

  if (base && orig === path) return;

  e.preventDefault();
  page.show(orig);
}

/**
 * Event button.
 */

function which (e) {
  e = e || window.event;
  return null === e.which ? e.button : e.which;
}

/**
 * Check if `href` is the same origin.
 */

function sameOrigin (href) {
  var origin = location.protocol + '//' + location.hostname;
  if (location.port) origin += ':' + location.port;
  return (href && (0 === href.indexOf(origin)));
}

page.sameOrigin = sameOrigin;
