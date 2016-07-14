var select = require('soupselect').select,
    htmlparser = require('htmlparser'),
    request = require('request'),
    schema_url = 'schema.org';

function parse_html (html, cb) {
  var handler = new htmlparser.DefaultHandler(cb),
      parser = new htmlparser.Parser(handler);

  return parser.parseComplete(html);
}

var parse_related = (function () {

  function get_items (dom) {
    var items = select(dom, '#mainContent div ul li a');
    return items;
  }

  function get_item (dom) {
    return {
      href: '/' + dom.attribs.href,
      name: dom.children[0].raw
    };
  }

  return function (dom) {
    return get_items(dom).map(get_item);
  }

})();

var parse_object = (function () {

  function get_row_header (dom) {
    return select(dom, 'tr th a')[0].children[0].raw;
  }

  function get_rows (dom) {
    var body = select(dom, 'tbody.supertype')[0];
    return body.children;
  }

  function get_property (dom) {
    var property = select(dom, 'th.prop-nam code a');
    if (property.length) {
      return property[0].children[0].raw;
    }
  }

  function get_expected (dom) {
    var row = select(dom, '.prop-ect')[0],
        expected = {
          type: '',
        };
    if (row) {
      expected._links = {
        self: {
          href: [schema_url, row.children[1].attribs.href].join('/')
        }
      };
      expected.type = parse_expected(row.children);
      return expected;
    }
  }

  function parse_expected(items) {
    var mapped = items.map(function(item) {
      return item.name;
    });

    var ret = [];

    for(var i = 0; i < mapped.length; i++) {
      if(mapped[i] === 'a') {
        ret.push(items[i].children[0].raw);
      }
    }

    return ret;
  }

  function get_description (dom) {
    var description = select(dom, 'td.prop-desc');
    return description[0].children[0].raw;
  }

  return function (dom) {
    var rows = get_rows(dom);
    return rows.map(function (row) {
      var header = get_row_header(dom);
      var expected = get_expected(row),
          property = get_property(row);
      if (expected && property) {
        return {
          owner: header,
          description: get_description(row),
          expected: expected,
          property: property
        }; 
      }
    }).filter(Boolean);
  }
})();

function get_entity_description(dom) {
  var items = select(dom, '#mainContent')[0].children;
  var found = false;
  for(var i = 0; i < items.length; i++) {
    if(found && items[i].name === 'div') {
      return items[i].children[0].raw;
    }

    if(items[i].name === 'h4') {
      found = true;
    }
  }
  return 'whaaat??';
}

exports.entity = function (req, res) {
  var layer =  req.params.layer !== 'core' ? req.params.layer + '.' : '';
  request.get(['http://' + layer + schema_url, req.params.entity].join('/'), function (err, response) {
    if (err) {
      res.send(400, err);
    } else {
      parse_html(response.body, function (error, dom) {
        if (error) {
          res.send(400, error);
        } else {
          var properties = parse_object(dom),
              related = parse_related(dom),
              description = get_entity_description(dom);

          res.json({
            name: req.params.entity,
            description: description,
            layer: req.params.layer,
            _links: {
              self: {
                href: '/' + req.params.entity
              },
              related: related
            },
            _embedded: properties
          });
        }
      });
    }
  });
}