(function() {

function getValueForHeaderField(headers, field) {
  for (var i = 0, header; header = headers[i]; ++i) {
    if (header.name == field) {
      return header.value;
    }
  }
  return null;
}

/*
function getLink(links, rel) {
  for (var i = 0, link; link = links[i]; ++i) {
    if (rel == link.rel) {
      return link.href;
    }
  }
  return null;
}

function isContactMatch(entry, email) {
  for (var i = 0, email; email = entry.gd$email[i]; ++i) {
    if (email.address == email) {
      return true;
    }
  }
  return null;
}

function getProfileImageForEmail(entries, email) {
  for (var i = 0, entry; entry = entries[i]; ++i) {
    if (isContactMatch(entry, email)) {
      return getLink(entry.links, 'http://schemas.google.com/contacts/2008/rel#photo');
    }
  }
  return null;
}
*/

var template = document.querySelector('#t');

template.toggleDrawer = function() {
  this.$ && this.$.drawerPanel.togglePanel();
};

template.toggleSearch = function() {
  this.$.search.toggle();
};

template.menuSelect = function(e, detail, sender) {
  if (detail.isSelected) {
    this.toggleDrawer();
  }
};

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

template.onSigninFailure = function(e, detail, sender) {
  this.isAuthenticated = false;
};

template.onSigninSuccess = function(e, detail, sender) {
  this.isAuthenticated = true;

  // Cached data? We're already using it. Bomb out before making unnecessary requests.
  if (template.threads && template.users) {
    return;
  }

  // var worker = new Worker('worker.js');

  // worker.addEventListener('message', function(e) {
  //   var data =  e.data;

  //   console.log(data);
  // });

  // worker.postMessage({cmd: 'fetch'});

  var FROM_REGEX = new RegExp(/"?(.*?)"?\s+<(.*)>/);

  var gapi = e.detail.gapi;

  gapi.client.load('gmail', 'v1').then(function() {
    var gmail = gapi.client.gmail.users;

    // Fetch only the emails in the user's inbox.
    gmail.threads.list({userId: 'me', q: 'in:inbox -is:chat'}).then(function(resp) {
      
      var threads = resp.result.threads;

console.log(threads)

      var batch = gapi.client.newBatch();

      for (var i = 0, thread; thread = threads[i]; ++i) {
        var req = gmail.threads.get({userId: 'me', 'id': thread.id});
        batch.add(req);
      }

      batch.then(function(resp) {
        var i = 0;

console.log(resp.result);

        for (var id in resp.result) {

          threads[i].messages = resp.result[id].result.messages;

          for (var j = 0, m; m = threads[i].messages[j]; ++j) {

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

          i++;
        }

// TODO: Order threads by from date.

        // Set entire thread data at once, when it's all been processed.
        template.threads = threads;
      }, function(resp) {
        console.log(resp)
      });

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
  //var toolbar = document.querySelector('#mainheader');

  this.$.drawerPanel.addEventListener('core-header-transform', function(e) {
    var d = e.detail;

    // TODO: figure out why the header text is transformed at page load.

    // d.y: the amount that the header moves up
    // d.height: the height of the header when it is at its full size
    // d.condensedHeight: the height of the header when it is condensed
    //scale header's title
    var m = d.height - d.condensedHeight;
    // var scale = Math.max(0.5, (m - d.y) / (m / 0.25)  + 0.5);
    var scale = Math.max(0.5, (m - d.y) / (m / 0.5)  + 0.5);
    titleStyle.transform = titleStyle.transform = 'scale(' + scale + ') translateZ(0)';

    // Adjust header's color
    //toolbar.style.color = (d.y >= d.height - d.condensedHeight) ? '#fff' : '';
  });
});

// TODO: Remove. For testing.
if (!navigator.onLine) {
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

