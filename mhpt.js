'use strict';

const fs = require('fs');
const path = require('path');
const { fork, execSync } = require('child_process');
const makeResults = require('./lib/make-results.js');
const PATH_TO_GET_TIME = path.join(__dirname, '/lib/get-time.js');
const PATH_TO_GET_NODE_PATH = path.join(__dirname, '/lib/get-node-path.sh');

const DEFAULT_COUNT = 10000;

const getNodePath = (
  // Function which gets path to node by version
  version // String, versions of node, example: 9.4.0, 8.0, 7
  // Returns: String, path to node
) => {
  let pathToNode = null;
  if (process.env.NVM_DIR) {
    pathToNode = execSync(['sh', PATH_TO_GET_NODE_PATH, version, 'nvm']
      .join(' ')).toString().trim();
    if (fs.existsSync(pathToNode)) return pathToNode;
  }
  if (process.env.NVS_HOME) {
    pathToNode = execSync(['sh', PATH_TO_GET_NODE_PATH, version, 'nvs']
      .join(' ')).toString().trim();
    if (fs.existsSync(pathToNode)) return pathToNode;
  }
  throw new Error('Node: ' + version + ' not found');
};

const getFullVersion = (
  // Function which gets full node version from node path
  pathToNode // String, path to node
  // Returns: String, full node version
) => {
  const path = pathToNode.split('/');
  const version = path[path.length - 3];
  return version[0] === 'v' ? version.substring(1, version.length) : version;
};

const prepareRequests = (
  // Function which prepares requests to child processes
  versions, // Array of string, array of node versions
  testsSync, // Array of synchronous functions
  testsAsync // Array of asynchronous functions, callback-last
  // Returns: Array, array of requests
) => {
  const requests = [];
  versions.forEach(version => {
    const versionResults = []; // results of all functions in one node version
    const nodePath = getNodePath(version);
    const fullVersion = getFullVersion(nodePath);
    testsSync.forEach(func => {
      requests.push([func, 'sync', fullVersion, versionResults, nodePath]);
    });
    testsAsync.forEach(func => {
      requests.push([func, 'async', fullVersion, versionResults, nodePath]);
    });
  });
  return requests;
};

const getPathFromStack = (
  // Function which returns needed path from stack
  // Returns: String, path to file
) => {
  const LENGTH_OF_STACK = 3;
  const obj = {};
  Error.captureStackTrace(obj);
  return obj.stack.split('(')[LENGTH_OF_STACK].split(':')[0];
};

const speed = (
  // Function which manages the process of testing functions
  caption, // String, caption of test
  testFunctions, // Array, sync functions and array of async functions
  parameters = {} // Object, parametrs (count, versions, MAX_ANOMALY_PERCENT)
) => {
  const syncFunctions = []; // Array of synchronous functions
  const asyncFunctions = []; // Array of asynchronous functions, callback-last
  testFunctions.forEach(value => {
    if (typeof(value) === 'function') syncFunctions.push(value);
    else value.forEach(func => asyncFunctions.push(func));
  });

  if (process.argv[1] === PATH_TO_GET_TIME) { // start only from child process
    let modRef = module;
    while (modRef.parent.filename !== PATH_TO_GET_TIME) modRef = modRef.parent;
    syncFunctions.forEach(func => { modRef.exports[func.name] = func; });
    asyncFunctions.forEach(func => { modRef.exports[func.name] = func; });
    return;
  }
  const path = getPathFromStack();
  const count = parameters.count || DEFAULT_COUNT;
  const MAX_ANOMALY_PERCENT = parameters.MAX_ANOMALY_PERCENT || 5;
  const versions = parameters.versions || [process.versions.node];

  const results = new Map();
  // results of all functions on every requested node version

  const requests = prepareRequests(versions, syncFunctions, asyncFunctions);
  const numberOfFuncs = syncFunctions.length + asyncFunctions.length;

  const sendRequest = (
    func, // Function, tested function
    type, // String, 'sync' or 'async'
    version, // String, version of node
    versionResults, // Array, results of all functions in one node version
    nodePath // String, path to the needed version of the node
  ) => {
    const forked = fork(PATH_TO_GET_TIME, { execPath: nodePath });
    forked.send({
      name: func.name, count, type, path,
      percent: MAX_ANOMALY_PERCENT });
    forked.on('message', result => {
      versionResults.push(result);
      if (versionResults.length === numberOfFuncs) {
        results.set(version, versionResults);
        if (results.size === versions.length) {
          makeResults(results, caption, count);
        }
      }
      if (requests.length) sendRequest(...requests.pop());
    });
  };

  sendRequest(...requests.pop());
};
module.exports = { speed };
