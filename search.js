require('dotenv').config();

const request = require('request-promise');
const moment = require('moment');
const mailgun = require('mailgun-js');
const {flatten} = require('lodash');
const [,, query] = process.argv;

if (!query) {
  console.error('Usage: node index.js <search>');
}

const {
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  DESTINATION_EMAIL,
  RUMBLEON_TOKEN,
} = process.env;

function getRequestPayload(searchTerm) {
  return {
    "query": {
      "bool": {
        "should": [
          {
            "simple_query_string": {
              "query": searchTerm,
              "fields": [
                "title",
                "vin",
                "category",
                "stdExteriorColors",
                "stockNo",
                "keywords"
              ],
              "analyzer": "standard",
              "default_operator": "AND",
              "minimum_should_match": "100%"
            }
          },
          {
            "multi_match": {
              "query": searchTerm,
              "type": "phrase_prefix",
              "fields": [
                "title",
                "category",
                "stdExteriorColors",
                "keywords"
              ]
            }
          }
        ]
      }
    },
    "aggs": {
      "category3": {
        "filter": {
          "match_all": {}
        },
        "aggs": {
          "category.keyword": {
            "terms": {
              "field": "category.keyword",
              "size": 50
            }
          },
          "category.keyword_count": {
            "cardinality": {
              "field": "category.keyword"
            }
          }
        }
      },
      "year": {
        "filter": {
          "match_all": {}
        },
        "aggs": {
          "year": {
            "stats": {
              "field": "year"
            }
          }
        }
      },
      "stdMake": {
        "filter": {
          "match_all": {}
        },
        "aggs": {
          "stdMake.keyword": {
            "filter": {
              "match_all": {}
            },
            "aggs": {
              "stdMake.keyword": {
                "terms": {
                  "field": "stdMake.keyword",
                  "size": 100
                }
              }
            }
          }
        }
      },
      "price": {
        "filter": {
          "match_all": {}
        },
        "aggs": {
          "price": {
            "stats": {
              "field": "price"
            }
          }
        }
      },
      "mileage7": {
        "filter": {
          "match_all": {}
        },
        "aggs": {
          "mileage": {
            "range": {
              "field": "mileage",
              "ranges": [
                {
                  "key": "All"
                },
                {
                  "key": "From 0 to 5K Miles",
                  "from": 0,
                  "to": 5000
                },
                {
                  "key": "From 5K to 10K Miles",
                  "from": 5000,
                  "to": 10000
                },
                {
                  "key": "From 10K to 20K Miles",
                  "from": 10000,
                  "to": 20000
                },
                {
                  "key": "From 20K to 30K Miles",
                  "from": 20000,
                  "to": 30000
                },
                {
                  "key": "From 30K to 40K Miles",
                  "from": 30000,
                  "to": 40000
                },
                {
                  "key": "From 40K to 50K Miles",
                  "from": 40000,
                  "to": 50000
                },
                {
                  "key": "From 50K to 60K Miles",
                  "from": 50000,
                  "to": 60000
                }
              ]
            }
          }
        }
      },
      "exteriorColor8": {
        "filter": {
          "match_all": {}
        },
        "aggs": {
          "stdExteriorColors.keyword": {
            "terms": {
              "field": "stdExteriorColors.keyword",
              "size": 10
            }
          },
          "stdExteriorColors.keyword_count": {
            "cardinality": {
              "field": "stdExteriorColors.keyword"
            }
          }
        }
      },
      "statusOrder_v29": {
        "filter": {
          "match_all": {}
        },
        "aggs": {
          "listingType.keyword": {
            "terms": {
              "field": "listingType.keyword",
              "size": 50,
              "order": {
                "_term": "asc"
              }
            }
          },
          "listingType.keyword_count": {
            "cardinality": {
              "field": "listingType.keyword"
            }
          }
        }
      },
      "isOnHold10": {
        "filter": {
          "match_all": {}
        },
        "aggs": {
          "isOnHold": {
            "terms": {
              "field": "isOnHold",
              "size": 50
            }
          },
          "isOnHold_count": {
            "cardinality": {
              "field": "isOnHold"
            }
          }
        }
      }
    },
    "size": 52,
    "sort": [
      {
        "_score": "desc"
      }
    ],
    "highlight": {
      "fields": {
        "make": {},
        "year": {}
      }
    },
    "suggest": {
      "text": searchTerm,
      "suggestions": {
        "phrase": {
          "field": "model",
          "real_word_error_likelihood": 0.95,
          "max_errors": 1,
          "gram_size": 4,
          "direct_generator": [
            {
              "field": "model",
              "suggest_mode": "always",
              "min_word_length": 1
            }
          ]
        }
      }
    },
    "_source": [
      "title",
      "stdMake",
      "stdModel",
      "stdExteriorColors",
      "vin",
      "make",
      "model",
      "exteriorColor",
      "price",
      "year",
      "category",
      "mileage",
      "imageUrl",
      "stockNo",
      "statusOrder",
      "isOnHold",
      "dealerId",
      "isRumbleOnBike",
      "waterMarkText",
      "listingType",
      "retailSiteEndTime",
      "keywords",
      "id"
    ]
  };
}

async function search(searchTerm) {
  const options = {
    uri: 'https://consumersearchservice.rumbleon.com/v2-consumerweb-prod/inventory/_search',
    headers: {
      'Authorization': `Basic ${RUMBLEON_TOKEN}`
    },
    body: getRequestPayload(searchTerm),
    json: true
  };

  const data = await request(options);

  return data.hits.hits;
}

async function email(searchTerm) {
  const hits = await search(searchTerm);

  console.log(hits)

}

function render(item) {
  const hit = item._source;
  const fmt = new Intl.NumberFormat('en-US');
  const days = moment(hit.retailSiteEndTime).diff(moment(), 'days');

  return `
  <tr>
    <td width="50%">
      <a href="https://www.rumbleon.com/buy/${hit.vin}">
        <img src="${hit.imageUrl}" width="100%"/>
      </a>
    </td>
    <td width="50%">
        <h2>
          ${hit.title}
          <br />
          <span style="color:#383">$${fmt.format(hit.price)}</span>
        </h1>
        <p>
          ${fmt.format(hit.mileage)} miles (${hit.listingType})
          <br />
          ${days} days left
        </p>
    </td>
  </tr>
`;
}

function html(parts) {
  return `
    <html>
      <div style="text-align: center">
        <h1>RumbleOn</h1>
        <pre>"${query}"</pre>
      </div>

      <table cellpadding="25">
        ${parts.join('')}
      </table>
    </html>
`;
}

async function emailResults(parts) {
  return email({
    subject: `Found ${parts.length} motorcycles that match ${query}`,
    html: html(parts),
  });
}

async function email(data) {
  const options = Object.assign({
    from: `RumbleOn Tracker <mailgun@${MAILGUN_DOMAIN}.mailgun.org>`,
    to: DESTINATION_EMAIL,
  }, data);

  return new Promise((resolve, reject) => {
    const client = mailgun({apiKey: MAILGUN_API_KEY, domain: `${MAILGUN_DOMAIN}.mailgun.org`});

    client.messages().send(options, function (error, body) {
      if (error) {
        return reject(error);
      }

      resolve(body);
    });
  });
}

async function run(searchTerm) {
  try {
    const results = flatten(await Promise.all(searchTerm.split(',').map(search)));
    const parts = results.map(render);

    await emailResults(parts);
  } catch (e) {
    await email({
      subject: `Error running rumbleon tracker`,
      html: `<pre>${e.message}\n${e.stack}</pre>`,
    });

    process.exit(1);
  }
}

run(query);
