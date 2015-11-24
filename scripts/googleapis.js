/**
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

class GoogleClientAPI {

  constructor(apiName, version) {
    this._loadedPromise = null;
    this.apiName = apiName;
    this.version = version;
  }

  get loaded() {
    return !!(window.gapi && gapi.client && this.api);
  }

  get api() {
    return !!window.gapi && gapi.client ? gapi.client[this.apiName] : null;
  }

  // Loads the google client API and returns a promise. Ensures the library is
  // loaded from network only once.
  init() {
    // Return the API if it's already loaded.
    if (this.loaded) {
      return Promise.resolve(this.api);
    }

    // Ensure we only load the client lib once. Subscribers will race for it.
    if (!this._loadedPromise) {
      this._loadedPromise = new Promise((resolve, reject) => {
        gapi.load('client', () => {
          gapi.client.load(this.apiName, this.version).then(() => {
            resolve(this.api);
          });
        });
      });
    }

    return this._loadedPromise;
  }
}

export class GMail extends GoogleClientAPI {

  constructor() {
    super('gmail', 'v1');
    this._FROM_HEADER_REGEX = new RegExp(/"?(.*?)"?\s?<(.*)>/);
  }

  static get Labels() {
    return {
      Colors: ['pink', 'orange', 'green', 'yellow', 'teal', 'purple'],
      UNREAD: 'UNREAD',
      STARRED: 'STARRED'
    };
  }

  static getValueForHeaderField(headers, field) {
    // jshint boss:true
    for (let i = 0, header; header = headers[i]; ++i) {
      if (header.name === field || header.name === field.toLowerCase()) {
        return header.value;
      }
    }
    return null;
  }

  // Returns true if date1 is the same day as date2.
  static isToday(date1, date2) {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  }

  fixUpMessages(resp) {
    let messages = resp.result.messages;

    // jshint boss:true
    for (let j = 0, m; m = messages[j]; ++j) {
      let headers = m.payload.headers;

      let date = new Date(GMail.getValueForHeaderField(headers, 'Date'));

      let isToday = GMail.isToday(new Date(), date);
      if (isToday) {
        // Example: Thu Sep 25 2014 14:43:18 GMT-0700 (PDT) -> 14:43:18.
        m.date = date.toLocaleTimeString().replace(
            /(\d{1,2}:\d{1,2}):\d{1,2}\s(AM|PM)/, '$1 $2');
      } else {
        // Example: Thu Sep 25 2014 14:43:18 GMT-0700 (PDT) -> Sept 25.
        m.date = date.toDateString().split(' ').slice(1, 3).join(' ');
      }

      m.to = GMail.getValueForHeaderField(headers, 'To');
      m.subject = GMail.getValueForHeaderField(headers, 'Subject');

      let fromHeaders = GMail.getValueForHeaderField(headers, 'From');

      // Use Reply-To Header if From header wasn't found.
      if (!fromHeaders) {
        fromHeaders = GMail.getValueForHeaderField(headers, 'Reply-To');
      }

      let fromHeaderMatches = fromHeaders.match(this._FROM_HEADER_REGEX);

      m.from = {};

      // Use name if one was found. Otherwise, use email address.
      if (fromHeaderMatches) {
        // If no a name, use email address for displayName.
        m.from.name = fromHeaderMatches[1].length ? fromHeaderMatches[1] :
                                                    fromHeaderMatches[2];
        m.from.email = fromHeaderMatches[2];
      } else {
        m.from.name = fromHeaders.split('@')[0];
        m.from.email = fromHeaders;
      }
      m.from.name = m.from.name.split('@')[0]; // Ensure email is split.

      m.unread = (m.labelIds ?
          m.labelIds.indexOf(GMail.Labels.UNREAD) !== -1 : false);
      m.starred = (m.labelIds ?
          m.labelIds.indexOf(GMail.Labels.STARRED) !== -1 : false);
    }

    return messages;
  }

  fetchLabels() {
    return this.init().then(api => {
      let fetchLabels = api.users.labels.list({userId: 'me'});
      return fetchLabels.then(resp => {
        let labels = resp.result.labels.filter((label, i) => {
          // Add color to label.
          label.color = GMail.Labels.Colors[i % GMail.Labels.Colors.length];
          return label.type !== 'system'; // Don't include system labels.
        });

        let labelMap = labels.reduce((o, v, i) => {
          o[v.id] = v;
          return o;
        }, {});

        return {labels: labels, labelMap: labelMap};
      });
    });
  }

  fetchMail(q) {
    return this.init().then(api => {
      // Fetch only the emails in the user's inbox.
      let fetchThreads = api.users.threads.list({userId: 'me', q: q});
      return fetchThreads.then(resp => {

        let batch = gapi.client.newBatch();
        let threads = resp.result.threads;

        if (!threads) {
          return [];
        }

        // Setup a batch operation to fetch all messages for each thread.
        // jshint boss:true
        for (let i = 0, thread; thread = threads[i]; ++i) {
          let req = api.users.threads.get({userId: 'me', 'id': thread.id});
          batch.add(req, {id: thread.id}); // Give each request a unique id for lookup later.
        }

        // Like Promise.all, but resp is an object instead of promise results.
        return batch.then(resp => {
          // jshint boss:true
          for (let i = 0, thread; thread = threads[i]; ++i) {
            thread.messages = this.fixUpMessages(
                resp.result[thread.id]).reverse();
            //thread.archived = false; // initialize archived.
          }
          return threads;
        });

      });
    });
  }
}

export class GPlus extends GoogleClientAPI {

  constructor() {
    super('plus', 'v1');
  }

  get COVER_IMAGE_SIZE() { return 315; }
  get PROFILE_IMAGE_SIZE() { return 75; }

  _getAllUserProfileImages(users, nextPageToken, callback) {
    this.api.people.list({
      userId: 'me', collection: 'visible', pageToken: nextPageToken
    }).then(resp => {

      // Map name to profile image.
      users = resp.result.items.reduce((o, v, i) => {
        o[v.displayName] = v.image.url;
        return o;
      }, users);

      if (resp.result.nextPageToken) {
        this._getAllUserProfileImages(
            users, resp.result.nextPageToken, callback);
      } else {
        callback(users);
      }

    });
  }

  fetchFriendProfilePics() {
    let users = {};
    return this.init().then(plus => {
      return new Promise((resolve, reject) => {
        this._getAllUserProfileImages(users, null, resolve);
      });
    });
  }

  fetchUsersCoverImage() {
    return this.init().then(api => {
      // Get user's profile pic, cover image, email, and name.
      return api.people.get({userId: 'me'}).then(resp => {
        // let img = resp.result.image && resp.result.image.url.replace(/(.+)\?sz=\d\d/, "$1?sz=" + this.PROFILE_IMAGE_SIZE);
        if (!resp.result.cover) {
          return null;
        }
        return resp.result.cover.coverPhoto.url.replace(
            /\/s\d{3}-/, '/s' + this.COVER_IMAGE_SIZE + '-');
      });
    });
  }
}
