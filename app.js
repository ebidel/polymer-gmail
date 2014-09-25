(function() {

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

template.previousSearches = [
  "something fun",
  "tax forms",
  'to: me',
  'airline tickets',
  'party on saturday'
];

template.user = {
  name: 'Some User',
  email: 'some@example.com',
  profile: 'https://lh5.googleusercontent.com/-kgFnix5akCc/AAAAAAAAAAI/AAAAAAAAOqk/IVG-V3nJ8jM/s60-c/photo.jpg'
};

template.data = [{
  name: 'Eric',
  profile: 'https://lh5.googleusercontent.com/-kgFnix5akCc/AAAAAAAAAAI/AAAAAAAAOqk/IVG-V3nJ8jM/s60-c/photo.jpg',
  subject: 'Hi there',
  snippet: 'How is it going pal? What have you been up to lately?',
  timestamp: '7:00pm'
}, {
  name: 'Addy',
  profile: 'https://lh3.googleusercontent.com/-riQH0F3Zb2k/AAAAAAAAAAI/AAAAAAAAyyI/A0ynkSbO-nM/s60-c/photo.jpg',
  subject: 'Yeoman',
  snippet: 'Can we finalize the dates for the Polymer meetup?',
  timestamp: '6:34pm'
}, {
  name: 'Alice',
  profile: 'https://lh5.googleusercontent.com/-nS21Q4tD1R4/AAAAAAAAAAI/AAAAAAAAAp4/ixMudlaPGDs/s60-c/photo.jpg',
  subject: 'Accessible web components',
  snippet: 'I have some thoughts about making Polymer components accessible. Do you want to schedule a meeting?',
  timestamp: '3:14pm'
}, {
  name: 'Rob',
  profile: 'https://lh3.googleusercontent.com/-0IG6advy6qg/AAAAAAAAAAI/AAAAAAAAAJM/pivb_QaIJjQ/s60-c/photo.jpg',
  subject: 'Business trip',
  snippet: 'Can we finalize the dates for the Polymer meetup?',
  timestamp: '10:34am'
}, {
  name: 'Rob',
  profile: 'https://lh3.googleusercontent.com/-0IG6advy6qg/AAAAAAAAAAI/AAAAAAAAAJM/pivb_QaIJjQ/s60-c/photo.jpg',
  subject: 'Business trip',
  snippet: 'Can we finalize the dates for the Polymer meetup?',
  timestamp: '10:34am'
}, {
  name: 'Rob',
  profile: 'https://lh3.googleusercontent.com/-0IG6advy6qg/AAAAAAAAAAI/AAAAAAAAAJM/pivb_QaIJjQ/s60-c/photo.jpg',
  subject: 'Business trip',
  snippet: 'Can we finalize the dates for the Polymer meetup?',
  timestamp: '10:34am'
}, {
   name: 'Rob',
   profile: 'https://lh3.googleusercontent.com/-0IG6advy6qg/AAAAAAAAAAI/AAAAAAAAAJM/pivb_QaIJjQ/s60-c/photo.jpg',
   subject: 'Business trip',
   snippet: 'Can we finalize the dates for the Polymer meetup?',
   timestamp: '10:34am'
 }, {
    name: 'Rob',
    profile: 'https://lh3.googleusercontent.com/-0IG6advy6qg/AAAAAAAAAAI/AAAAAAAAAJM/pivb_QaIJjQ/s60-c/photo.jpg',
    subject: 'Business trip',
    snippet: 'Can we finalize the dates for the Polymer meetup?',
    timestamp: '10:34am'
  }, {
     name: 'Rob',
     profile: 'https://lh3.googleusercontent.com/-0IG6advy6qg/AAAAAAAAAAI/AAAAAAAAAJM/pivb_QaIJjQ/s60-c/photo.jpg',
     subject: 'Business trip',
     snippet: 'Can we finalize the dates for the Polymer meetup?',
     timestamp: '10:34am'
   }, {
      name: 'Rob',
      profile: 'https://lh3.googleusercontent.com/-0IG6advy6qg/AAAAAAAAAAI/AAAAAAAAAJM/pivb_QaIJjQ/s60-c/photo.jpg',
      subject: 'Business trip',
      snippet: 'Can we finalize the dates for the Polymer meetup?',
      timestamp: '10:34am'
    }, {
       name: 'Rob',
       profile: 'https://lh3.googleusercontent.com/-0IG6advy6qg/AAAAAAAAAAI/AAAAAAAAAJM/pivb_QaIJjQ/s60-c/photo.jpg',
       subject: 'Business trip',
       snippet: 'Can we finalize the dates for the Polymer meetup?',
       timestamp: '10:34am'
     }];

template.addEventListener('template-bound', function(e) {

var titleStyle = document.querySelector('.title').style;
var toolbar = document.querySelector('#mainheader');

document.querySelector('#drawerPanel').addEventListener('core-header-transform', function(e) {
  var d = e.detail;

  // d.y: the amount that the header moves up
  // d.height: the height of the header when it is at its full size
  // d.condensedHeight: the height of the header when it is condensed
  //scale header's title
  var m = d.height - d.condensedHeight;
  var scale = Math.max(0.5, (m - d.y) / (m / 0.25)  + 0.5);
  titleStyle.transform = titleStyle.transform = 'scale(' + scale + ') translateZ(0)';

  // Adjust header's color
  //toolbar.style.color = (d.y >= d.height - d.condensedHeight) ? '#fff' : '';
});


});

})();

