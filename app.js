const http = require('http')
const fs = require('fs')
const jsdom = require("jsdom");
const got = require('got');
const FormData = require('form-data');
const { JSDOM } = jsdom;

const events_url = "https://centres.macnet.ca/icwaterloo/events/list/"
const args = process.argv.slice(2);

const daily_participants = {
  'fajr': ['Hashim Mir', 'Amjad Mir'],
  'isha': ['Amjad Mir', 'Hashim Mir'],
  // 'dhuhr-2': ['Hashim Mir'],
  // 'asr': ['Hashim Mir'],
};

const jummah_participants = {
  'jummah-3': ['Amjad Mir'],
  'jummah-4': ['Ibrahim Mir'],
}

function isJummahRegistration() {
  return args.includes('jummah');
}

function getParticipants() {
  if (isJummahRegistration()) {
    return jummah_participants;
  }
  return daily_participants;
}

function getCanonicalizedJummahLabel(label) {
  label = label.toLowerCase();
  var building = '';
  if (!label.includes('main') && label.includes('2nd building')) {
    building = '@b2';
  }

  if (label.includes('1st prayer') || label.includes('first prayer')) {
    return 'jummah-1' + building;
  } else if (label.includes('2nd prayer') || label.includes('second prayer')) {
    return 'jummah-2' + building;
  } else if (label.includes('3rd prayer') || label.includes('third prayer')) {
    return 'jummah-3' + building;
  } else if (label.includes('4th prayer') || label.includes('fourth prayer')) {
    return 'jummah-4' + building;
  }
}

function getCanonicalizedLabel(label) {
  label = label.toLowerCase();
  var building = '';

  // Indicates it is for the second building.
  if (label.includes('2nd') || label.includes('second')) {
    building = '@b2'
  }
  if (label.includes('fajr')) {
    return 'fajr' + building;
  } else if (label.includes('dhuhr')) {
    return 'dhuhr' + building;
  } else if (label.includes('asr')) {
    return 'asr' + building;
  } else if (label.includes('maghreb')) {
    return 'maghreb' + building;
  } else if (label.includes('isha')) {
    return 'isha' + building;
  }
  return '';
}

async function getRegistrationUrl() {
  return got(events_url).then(response => {
    const document = new JSDOM(response.body).window.document;
    var elements = document.querySelectorAll('.tribe-event-url');
    for (var i=0; i < elements.length; i++) {
      if (elements[i].href.includes('congregation') && !isJummahRegistration()) {
        return elements[i].href;
      } else if (elements[i].href.includes('jum') && isJummahRegistration()) {
        return elements[i].href;
      }
    }
    return elements[0].href;
  });
}

async function getProductIds(registration_url, product_ids) {
  return got(registration_url).then(response => {
    const document = new JSDOM(response.body).window.document;
    var table = document.querySelector('.tribe-events-tickets-rsvp');
    for (var i=0, row; row = table.rows[i]; i++) {
        var ticket_cell = row.getElementsByClassName('tickets_name');
        if (ticket_cell.length == 1 && row.getElementsByTagName('input').length > 0) {
          var label = isJummahRegistration() ? 
              getCanonicalizedJummahLabel(ticket_cell[0].innerHTML.trim()) : 
              getCanonicalizedLabel(ticket_cell[0].innerHTML.trim());
          if (label) {
            product_ids[label] = row.getElementsByTagName('input')[0].value;
          }
        }
    }
    return product_ids;
  }).catch(err => {
    console.log(err);
  });
}

function makeKey(key, product_id, i) {
  return "tribe-tickets-meta[" + product_id + "][" + i + "][" + key + "]";
}

function addParticipant(i, first_name, last_name, product_id, form_data) {
  form_data[makeKey('first-name', product_id, i)] = first_name;
  form_data[makeKey('last-name', product_id, i)] = last_name;
  form_data[makeKey('phone-number', product_id, i)] = '6692539487';
  form_data[makeKey('did-you-pass-the-health-pre-screening-at-https-covid-19-ontario-ca-self-assessment', product_id, i)] = 'Yes';
  form_data[makeKey('are-you-between-14-to-70-years-old', product_id, i)] = 'Yes';
  form_data[makeKey('i-agree-that-i-will-bring-my-own-prayer-mat-make-wudu-at-home-and-wear-a-mask', product_id, i)] = 'Yes';
  form_data[makeKey('i-confirm-that-i-read-the-guidelines-for-attending-the-prayer-and-i-will-follow-them', product_id, i)] = 'Yes';
  form_data[makeKey('do-you-consent-to-being-added-to-our-mailing-list-and-receiving-correspondence-from-us', product_id, i)] = 'Yes';
}

function addParticipants(form_data, product_ids, participants) {
  for (const prayer of Object.keys(participants)) {
    const product_id = product_ids[prayer];
    for (var i = 0; i < participants[prayer].length; i++) {
      var name = participants[prayer][i].split(' ');
      console.log('registering ', participants[prayer][i], ' for ', prayer)
      addParticipant(i, name[0], name[1], product_id, form_data);
    }
    if (form_data['product_id[]']) {
      form_data['product_id[]'].push(product_id);
    } else {
      form_data['product_id[]'] = [product_id];
    }
    form_data['quantity_' + product_id] = participants[prayer].length;
  }
}

async function main() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    fs.createReadStream('index.html').pipe(res)
  })

  server.listen(process.env.PORT || 3000)

  const registration_url = await getRegistrationUrl();
  console.log('url = ', registration_url);
  var product_ids = {};
  const participants = getParticipants();
  
  while (true) {
    await getProductIds(registration_url, product_ids);
    console.log('productIds = ', product_ids);

    const product_keys = Object.keys(product_ids);
    if (Object.keys(participants).every(key => product_keys.includes(key))) {
      console.log('found all prayers, proceeding to register');
      break;
    }
    console.log('retrying after pause...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  var form_data = {
    'attendee[full_name]': 'Hashim Mir',
    'attendee[email]': 'hashim.mir123@gmail.com',
    'attendee[order_status]': 'yes',
    'tribe_tickets_rsvp_submission': '1',
    'tickets_process': '1',
  };
  addParticipants(form_data, product_ids, participants);
  console.log(form_data);

  var form = new FormData();
  for (const [key, value] of Object.entries(form_data)) {
    if (Array.isArray(value)) {
      value.forEach(val => form.append(key, val));
      continue;
    }
    form.append(key, value);
  }
  if (args.includes('dry_run')) {
    console.log('Skipping registration, since --dry_run was specified.');
    process.exit();
  }
  return form.submit(registration_url, function(err, res) {
    res.resume();
    var body = "";
    res.on('readable', function() {
        body += res.read();
    });
    res.on('end', () => {
      if (!res.complete) {
        console.error(
          'The connection was terminated while the message was still being sent');
      }
      console.log('registration complete!');
      process.exit();
    });
  });
}

main();