/*
 * polytweet 0.1
 *
 * by Bob Hitching 
 *
 * @hitching
 *
 * a Polytweet is a Tweet Marker with Place rollover
 *
 */

(function() {

// object to store all PolytweetPlace objects, can be shared among many maps
var _places = {};

/*
 * A Polytweet is a Marker extended with a Tweet model and perhaps a Place
 */
function Polytweet(_tweet, _map, _style_over, _style_out) {
	this._tweet = _tweet;
	
	// lat lng is optional
	if (_tweet.coordinates && _tweet.coordinates.coordinates) {
		var _points = _tweet.coordinates.coordinates;
		this._position = new google.maps.LatLng(parseFloat(_points[1]), parseFloat(_points[0]));
	} else if (!_tweet.place || !_tweet.place.id || !_tweet.place.bounding_box || !_tweet.place.bounding_box.coordinates) {
		// tweet cannot be located on the map without lat/lng or place
		return;
	}
	
	if (_style_over) this._style_over = _style_over;
	if (_style_out) this._style_out = _style_out;

	this.setMap(_map);
}

Polytweet.prototype = new google.maps.OverlayView();

Polytweet.prototype.getPosition = function() {
	if (typeof(this._position) != 'undefined') {
		return this._position;
	}
}

Polytweet.prototype.onAdd = function() {
	var _div = document.createElement('div');
	_div.style.position = 'absolute';
	_div.style.cursor = 'pointer';
	
	var _img = document.createElement('img');
	_img.id = 'tid_' + this._tweet.id;
	_img.width = 24;
	_img.height = 24;
	_img.style.width = 24;
	_img.style.height = 24;
	_img.src = this._tweet.user.profile_image_url;
	
	// represent approx. location with dotted border and opacity
	if (typeof(this._position) == 'undefined') {
		_img.className = 'polytweet_approx';
		_div.className = 'hovercardable';
	} else {
		_div.className = 'polytweet_exact hovercardable';
	}
	
	_div.appendChild(_img);
	
	// for use in hovercards
	// @anywhere sometimes passes the div, sometimes the img to the username function 
	_div.title = this._tweet.user.screen_name;
	_img.title = this._tweet.user.screen_name;
	
	if (this._tweet.place) {
		// decorate rollover with place name
		if (this._tweet.place.name) {
			_div.title += ' in ' + this._tweet.place.name;
			_img.title += ' in ' + this._tweet.place.name;	
		}

		// setup event listeners to highlight the place
		if (this._tweet.place.id)  {
			var _self = this;
		
			google.maps.event.addDomListener(_img, "mouseover", function() {
				if (typeof(_self._position) == 'undefined') {
					this.className = 'polytweet_over';
				}
				var _opts = _self._style_over || { fillOpacity: 0.2 };
				_opts.paths = _places[_self._tweet.place.id].getPaths();
				_places[_self._tweet.place.id].setOptions(_opts);
			});

			google.maps.event.addDomListener(_img, "mouseout", function() {
				if (typeof(_self._position) == 'undefined') {
					this.className = 'polytweet_approx';
				}
				var _opts = _self._style_out || { fillOpacity: 0 };
				_opts.paths = _places[_self._tweet.place.id].getPaths();
				_places[_self._tweet.place.id].setOptions(_opts);
			});

		}
	}
	
	this._div = _div;
	this._img = _img;
	this.getPanes().overlayImage.appendChild(_div);
};

Polytweet.prototype.draw = function() {
	// do we need to create a polygon?
	if (this._tweet.place && !(this._tweet.place.id in _places)) {
		// create polygon	
		var _polygon_array = this._tweet.place.bounding_box.coordinates.map(function(_polygon) {
			return _polygon.map(function(_point_array) {
				return new google.maps.LatLng(_point_array[1], _point_array[0]);
			});
		});
		
		_places[this._tweet.place.id] = new PolytweetPlace(_polygon_array, this);
		
		// setup zoom listener when we have created the first PolytweetPlace
		if (!this.getMap()._zoom_listener) {
			this.getMap()._zoom_listener = google.maps.event.addListener(this.getMap(), 'zoom_changed', function() {				
				// reset polygons
				for (_id in _places) {
					_places[_id]._reset();
				}
			});
		}
	}
	
	if (typeof(this._position) == 'undefined') {
		// assign a point on the polygon perimeter
		var _pixel = _places[this._tweet.place.id]._assign_point(this.getProjection(), (this._tweet.id.toString().slice(-4) % 1000)/1000);
		_pixel.y -= 12;
	} else {
		// exact point from lat/lng
		var _pixel = this.getProjection().fromLatLngToDivPixel(this._position);
		_pixel.y -= 32;
	}
	
	this._div.style.left = (_pixel.x - 12) + 'px';
	this._div.style.top = (_pixel.y) + 'px';
};

Polytweet.prototype.onRemove = function() {
	this._div.parentNode.removeChild(this._div);
	this._div = null;
};

// polygon to show approximate location of tweets
function PolytweetPlace(_polygon_array, _polytweet) {
	this._reset();
	
	var _opts = _polytweet._style_out || {
		strokeColor: "#FF0000",
		strokeOpacity: 0,
		strokeWeight: 0,
		fillColor: "#FF0000",
		fillOpacity: 0
	};
	_opts.paths = _polygon_array;

	this.setOptions(_opts);
	this.setMap(_polytweet.getMap());
}

PolytweetPlace.prototype = new google.maps.Polygon();

// edges and perimeter will be calculated when the first related Polytweet is drawn
PolytweetPlace.prototype._reset = function() {
	this._edges = []; // array of x, y, length
	this._perimeter = 0;
}

// create a wireframe of edges connecting all the points of the polygon
// so approximately-located tweets can be located along one of those edges.
// projection is passed from OverlayView when drawing a Marker
PolytweetPlace.prototype._wireframe = function(_projection) {
	_path = this.getPath();
	_pixels = {};
	
	for (var _i = 0; _i < _path.getLength() - 1; _i++) {
		if (!(_i in _pixels)) _pixels[_i] = _projection.fromLatLngToDivPixel(_path.getAt(_i));
	
		for (var _j = _i + 1; _j < _path.getLength(); _j++) {
			if (!(_j in _pixels)) _pixels[_j] = _projection.fromLatLngToDivPixel(_path.getAt(_j));
		
			// calc distance of this edge
			_edge_length = Math.round(Math.sqrt(Math.pow(Math.abs(_pixels[_i].x - _pixels[_j].x), 2) + Math.pow(Math.abs(_pixels[_i].y - _pixels[_j].y), 2)));
		
			this._edges.push([_pixels[_i], _pixels[_j], _edge_length]);
			
			this._perimeter += _edge_length;
		}
	}
};

// position is between 0 and 1, based on tweet id 
// so the location along the wireframe edges remains at different zoom levels
PolytweetPlace.prototype._assign_point = function(_projection, _position) {
	if (!this._edges.length) this._wireframe(_projection);

	var _walk = this._perimeter * _position;

	var _i = 0;
	while (true) {
		var _leg = this._edges[_i][2];
		_walk -= _leg;
		if (_walk <= 0) break;
		_i++;
	}
	
	var _portion = _leg == 0 ? 0 : (_walk + _leg) / _leg;
	
	var _x = this._edges[_i][0].x + ((this._edges[_i][1].x - this._edges[_i][0].x) * _portion);
	var _y = this._edges[_i][0].y + ((this._edges[_i][1].y - this._edges[_i][0].y) * _portion);
	
	return new google.maps.Point(_x, _y);
};

// add Polytweet to the google.maps namespace
google.maps.Polytweet = Polytweet;

})();