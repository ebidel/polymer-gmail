(function() {

var DEBUG = location.search.indexOf('debug') != -1;

var FROM_REGEX = new RegExp(/"?(.*?)"?\s+<(.*)>/);

function getValueForHeaderField(headers, field) {
  for (var i = 0, header; header = headers[i]; ++i) {
    if (header.name == field || header.name == field.toLowerCase()) {
      return header.value;
    }
  }
  return null;
}

function getAllUserProfileImages(users, nextPageToken, callback) {
  gapi.client.plus.people.list({
    userId: 'me', collection: 'visible', pageToken: nextPageToken
  }).then(function(resp) {

    users = resp.result.items.reduce(function(o, v, i) {
      o[v.displayName] = v.image.url;
      return o;
    }, users);

    if (resp.nextPageToken) {
      getAllUserProfileImages(users, resp.nextPageToken, callback);
    } else {
      callback(users);
    }

  });
}

function fixUpMessages(resp) {
  var messages = resp.result.messages;

  for (var j = 0, m; m = messages[j]; ++j) {
    var headers = m.payload.headers;

    // Example: Thu Sep 25 2014 14:43:18 GMT-0700 (PDT) -> Sept 25.
    var date = new Date(getValueForHeaderField(headers, 'Date'));
    m.date = date.toDateString().split(' ').slice(1,3).join(' ');
    m.to = getValueForHeaderField(headers, 'To');
    m.subject = getValueForHeaderField(headers, 'Subject');

    var fromHeaders = getValueForHeaderField(headers, 'From');
    var fromHeaderMatches = fromHeaders.match(FROM_REGEX);

    // Use name if one was found. Otherwise, use email address.
    m.from = {
      name: fromHeaderMatches ? fromHeaderMatches[1] : fromHeaders,
      email: fromHeaderMatches ? fromHeaderMatches[2] : fromHeaders
    };
  }

  return messages;
}

var template = document.querySelector('#t');

template.toggleDrawer = function() {
  // Only make labels request when drawer is opened for the first time.
  // var gmail = this.gapi && this.gapi.client.gmail.users;

  // if (gmail && !this.labels) {
  //   gmail.labels.list({userId: 'me'}).then(function(resp) {
  //     // Don't include system labels.
  //     var labels = resp.result.labels.filter(function(label, i) {
  //       label.color = template.LABEL_COLORS[
  //           Math.round(Math.random() * template.LABEL_COLORS.length)];
  //       return label.type != 'system';
  //     });

  //     template.labels = labels;
  //   });
  // }

  this.$ && this.$.drawerPanel.togglePanel();
};

template.toggleSearch = function() {
  this.$.search.toggle();
};

template.newMail = function(e, detail, sender) {
  console.warn('Not implemented: Create new mail');
};

template.menuSelect = function(e, detail, sender) {
  if (detail.isSelected) {
    this.toggleDrawer();
  }
};

template.deselectAll = function(e, detail, sender) {
  this.$.threadlist.selected = [];
};

template.onSigninFailure = function(e, detail, sender) {
  if (DEBUG) {
    return;
  }

  this.isAuthenticated = false;
};

template.onSigninSuccess = function(e, detail, sender) {
  this.isAuthenticated = true;

  // Cached data? We're already using it. Bomb out before making unnecessary requests.
  if ((template.threads && template.users) || DEBUG) {
    return;
  }

  this.gapi = e.detail.gapi;

  gapi.client.load('gmail', 'v1').then(function() {
    var gmail = gapi.client.gmail.users;

    // Fetch only the emails in the user's inbox.
    gmail.threads.list({userId: 'me', q: 'in:inbox -is:chat'}).then(function(resp) {

      var threads = resp.result.threads;

      var batch = gapi.client.newBatch();

      threads.forEach(function(thread, i) {
        var req = gmail.threads.get({userId: 'me', 'id': thread.id});
        batch.add(req);
        req.then(function(resp) {
          thread.messages = fixUpMessages(resp);

          // Set entire thread data at once, when it's all been processed.
          template.job('addthreads', function() {
            this.threads = threads;
          }, 100);

        });
      });

      batch.then();

    });

    gmail.labels.list({userId: 'me'}).then(function(resp) {
      // Don't include system labels.
      var labels = resp.result.labels.filter(function(label, i) {
        label.color = template.LABEL_COLORS[
            Math.round(Math.random() * template.LABEL_COLORS.length)];
        return label.type != 'system';
      });

      template.labels = labels;
    });
  });

  gapi.client.load('plus', 'v1').then(function() {

    // Get user's profile pic, cover image, email, and name.
    gapi.client.plus.people.get({userId: 'me'}).then(function(resp) {
      var PROFILE_IMAGE_SIZE = 60;
      var COVER_IMAGE_SIZE = 315;

      var img = resp.result.image.url.replace(/(.+)\?sz=\d\d/, "$1?sz=" + PROFILE_IMAGE_SIZE);
      var coverImg = resp.result.cover.coverPhoto.url.replace(/\/s\d{3}-/, "/s" + COVER_IMAGE_SIZE + "-");

      template.user = {
        name: resp.result.displayName,
        email: resp.result.emails[0].value,
        profile: img,
        cover: coverImg
      };
    });

    var users = {};

    getAllUserProfileImages(users, null, function(users) {
      template.users = users;
      template.users[template.user.name] = template.user.profile;
    });

  });

};

template.LABEL_COLORS = ['pink', 'orange', 'green', 'yellow', 'teal', 'purple'];

// Better UX: presume user is logged in when app loads.
template.isAuthenticated = true;

template.selectedThreads = [];

// TODO: save this from users past searches using core-localstorage.
template.previousSearches = [
  "something fun",
  "tax forms",
  'to: me',
  'airline tickets',
  'party on saturday'
];

template.addEventListener('template-bound', function(e) {

  var titleStyle = document.querySelector('.title').style;

  this.$.drawerPanel.addEventListener('core-header-transform', function(e) {
    var d = e.detail;

    // d.y: the amount that the header moves up
    // d.height: the height of the header when it is at its full size
    // d.condensedHeight: the height of the header when it is condensed
    //scale header's title
    var m = d.height - d.condensedHeight;
    var scale = Math.max(0.5, (m - d.y) / (m / 0.25)  + 0.5);
    // var scale = Math.max(0.5, (m - d.y) / (m / 0.4)  + 0.5);
    titleStyle.transform = titleStyle.transform = 'scale(' + scale + ') translateZ(0)';

    // Adjust header's color
    //document.querySelector('#mainheader').style.color = (d.y >= d.height - d.condensedHeight) ? '#fff' : '';
  });
});

// Prevent context menu.
window.oncontextmenu = function() {
  return false;
};

if (!navigator.onLine || DEBUG) {
  document.addEventListener('polymer-ready', function(e) {
    var ajax = document.createElement('core-ajax');
    ajax.auto = true;
    ajax.url = '/data/users.json';
    ajax.addEventListener('core-response', function(e) {
      template.users = e.detail.response;
    });

    var ajax2 = document.createElement('core-ajax');
    ajax2.auto = true;
    ajax2.url = '/data/threads.json';
    ajax2.addEventListener('core-response', function(e) {
      template.threads = e.detail.response;
    });
  });
}

})();

