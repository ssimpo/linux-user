'use strict';

var Promise = require('bluebird');
var isRoot = require('is-root');
var util = require('util');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var fs = require('fs');
var cache = require("lru-cache")();

if(process.platform !== 'linux') {
  throw new Error('linux-user must be running on Linux');
}

if(!isRoot()) {
  throw new Error('linux-user must be running as root user');
}

var validUsernameRegex = /^([a-z_][a-z0-9_]{0,30})$/;

function validate (username) {
  return validUsernameRegex.test(username);
}

exports.validateUsername = validate;

exports.addUser = function (username, callback) {
  return new Promise(function(resolve, reject) {
    username = String(username);
    if(!validate(username)) {
      reject(new Error('Invalid username'));
      if (callback) {
        return callback(new Error('Invalid username'));
      }
    }

    cache.del('users');
    exec(util.format('useradd -m -s /usr/sbin/nologin %s', username), function (err, stdout, stderr) {
      if(err) {
        reject(err);
        if (callback) {
          return callback(err);
        }
      }

      var userInfo = exports.getUserInfo(username, callback);
      resolve(userInfo);
    });
  });
};

exports.removeUser = function (username, callback) {
  return new Promise(function(resolve, reject) {
    username = String(username);
    if(!validate(username)) {
      reject(new Error('Invalid username'));
      if (callback) {
        return callback(new Error('Invalid username'));
      }
    }

    cache.del('users');
    exec(util.format('userdel -rf %s', username), function(err, stdout, stderr) {
      if (err) {
        reject(err);
        if (callback) {
          return callback(err);
        }
      }
      resolve(stdout);
      callback(null, stdout, stderr);
    });
  });
};

exports.getUsers = function (callback) {
  return new Promise(function(resolve, reject) {
    var _users;

    if(cache.has('users')) {
      _users = cache.get('users');
      resolve(_users);
      if (callback) {
        return callback(null, _users);
      }
    }

    fs.readFile('/etc/passwd', function (err, content) {
      if(err) {
        reject(err);
        if (callback) {
          return callback(err);
        }
      }

      _users = content.toString().split('\n');
      _users.pop();
      _users = _users.map(function (line) {
        var _cols = line.split(':');
        return {
          username: _cols[0],
          password: _cols[1],
          uid: Number(_cols[2]),
          gid: Number(_cols[3]),
          fullname: _cols[4] && _cols[4].split(',')[0],
          homedir: _cols[5],
          shell: _cols[6]
        };
      });
      cache.set('users', _users);
      resolve(_users);
      if (callback) {
        callback(null, _users);
      }
    });
  });
};

exports.getUserInfo = function (username, callback) {
  return new Promise(function(resolve, reject) {
    exports.getUsers(function (err, users) {
      if(err) {
        reject(err);
        if (callback) {
          return callback(err);
        }
      }
      for(var i = 0; i < users.length; i++) {
        if(users[i].username === username) {
          if (callback) {
            resolve(users[i]);
            return callback(null, users[i]);
          } else {
            return resolve(users[i]);
          }
        }
      }
      reject(new Error('Username not found'));
      if (callback) {
        callback(null, null);
      }
    });
  });
};

exports.setPassword = function (username, password, callback) {
  return new Promise(function(resolve, reject) {
    username = String(username);
    password = String(password);
    if (!username || !password) {
      reject(new Error('Invalid arguments'));
      if (callback) {
        return callback(new Error('Invalid arguments'));
      }
    }
    if (!validate(username)) {
      reject(new Error('Invalid username'));
      if (callback) {
        return callback(new Error('Invalid username'));
      }
    }

    var _p = spawn('passwd', [username]);
    _p.stdin.end(password);
    _p.on('error', function(err) {
      reject(err);
      if (callback) {
        return callback(err);
      }
    });
    _p.on('exit', function () {
      resolve();
      if (callback) {
        callback();
      }
    });
  });
};

exports.addGroup = function (groupname, callback) {
  return new Promise(function(resolve, reject) {
    groupname = String(groupname);
    if(!validate(groupname)) {
      if (callback) {
        reject(new Error('Invalid groupname'));
        return callback(new Error('Invalid groupname'));
      }
    }

    cache.del('groups');
    exec(util.format('groupadd %s', groupname), function (err, stdout, stderr) {
      if(err) {
        if (callback) {
          reject(err);
          return callback(err);
        }
      }
      resolve(exports.getGroupInfo(groupname, callback));
    });
  });
};

exports.removeGroup = function (groupname, callback) {
  return new Promise(function(resolve, reject) {
    groupname = String(groupname);
    if (!validate(groupname)) {
      reject(new Error('Invalid groupname'));
      if (callback) {
        return callback(new Error('Invalid groupname'));
      }
    }

    cache.del('groups');
    exec(util.format('groupdel %s', groupname), function (err, stdout, stderr) {
      if (err) {
        reject(err);
        if (callback) {
          return callback(err);
        }
      }
      resolve(stdout);
      if (callback) {
        return callback(null, stdout, stderr);
      }
    });
  });
};

exports.getGroups = function (callback) {
  return new Promise(function(resolve, reject) {
    var _groups;

    if (cache.has('groups')) {
      _groups = cache.get('groups');
      resolve(_groups);
      if (callback) {
        return callback(null, _groups);
      }
    }
    fs.readFile('/etc/group', function (err, content) {
      if (err) {
        reject(err);
        if (callback) {
          return callback(err);
        }
      }

      _groups = content.toString().split('\n');
      _groups.pop();
      _groups = _groups.map(function (line) {
        var _cols = line.split(':');
        return {
          groupname: _cols[0],
          password: _cols[1],
          gid: Number(_cols[2]),
          members: _cols[3] ? _cols[3].split(',') : []
        };
      });
      cache.set('groups', _groups);
      resolve(_groups);
      if (callback) {
        callback(null, _groups);
      }
    });
  });
};

exports.getGroupInfo = function (groupname, callback) {
  return new Promise(function(resolve, reject) {
    exports.getGroups(function (err, groups) {
      if (err) {
        reject(err);
        if (callback) {
          return callback(err);
        }
      }
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].groupname === groupname) {
          if (callback) {
            resolve(groups[i]);
            return callback(null, groups[i]);
          } else {
            return resolve(groups[i]);
          }
        }
      }
      resolve();
      if (callback) {
        callback(null, null);
      }
    });
  });
};

exports.addUserToGroup = function (username, groupname, callback) {
  return new Promise(function(resolve, reject) {
    username = String(username);
    groupname = String(groupname);
    if (!validate(username) || !validate(groupname)) {
      reject(new Error('Invalid arguments'));
      if (callback) {
        return callback(new Error('Invalid arguments'));
      }
    }

    cache.del('users');
    cache.del('groups');
    exec(util.format('usermod -a -G %s %s', groupname, username), function (err, stdout, stderr) {
      if (err) {
        reject(err);
        if (callback) {
          return callback(err);
        }
      }
      resolve(stdout);
      return callback(null, stdout, stderr);
    });
  });
};