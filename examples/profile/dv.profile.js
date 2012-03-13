dv.EPSILON = 1e-9;

dv.logFloor = function(x, b) {
    return (x > 0)
      ? Math.pow(b, Math.floor(Math.log(x) / Math.log(b)))
      : -Math.pow(b, -Math.floor(-Math.log(-x) / Math.log(b)));
};

function dv_bins(data, bins, min, max, step) {
    var bmin = min !== undefined,
        bmax = max !== undefined;
    min = bmin ? min : d3.min(data);
    max = bmax ? max : d3.max(data);
    var span = max - min;

    /* Special case: empty, invalid or infinite span. */
    if (!span || !isFinite(span)) return [min, min, 1];

    var s = Math.pow(10, Math.round(Math.log(span) / Math.log(10)) - 1),
        d = [Math.floor(min / s) * s, Math.ceil(max / s) * s];
    if (bmin) d[0] = min;
    if (bmax) d[1] = max;

    if (step === undefined) {
        step = dv.logFloor((d[1]-d[0])/bins, 10);
        var err = bins / ((d[1]-d[0]) / step);
        if (err <= .15) step *= 10;
        else if (err <= .35) step *= 5;
        else if (err <= .75) step *= 2;
    }
    d.push(step);

    return d;
}

// query for brushing & linking data, checking cache first
function dv_profile_cache(evt, query) {
    //if (!dv.profile.cache) return evt.data.query(query);

    var cmp = function(a,b) {
        return keys[a] < keys[b] ? -1 : (keys[a] > keys[b] ? 1 : 0);
    }
    var dims = query.dims, idx = [], i, dat
        keys = dims.map(function(d,i) { idx.push(i); return d/*.key*/; });
    idx.sort(cmp);
    var key = idx.map(function(j) { return keys[j]; }).join("__");

    if (!(dat = evt.cache[key])) {
        // cache miss: execute the query
        dims = idx.map(function(j) { return dims[j]; });
        window.dat = {evt:evt, dims:dims, vals:query.vals};
        dat = evt.data.query({dims:dims, vals:query.vals});
        evt.cache[key] = dat;
    }
    // return table columns in correct order
    idx.push(idx.length); // include count column
    return idx.map(function(j) { return dat[j]; });
}

// Profiler instace to manage plots and coordinate linked selections
dv.profile = function(data) {
    var g = [],
        add = function(vis) { qdata = null; g.push(vis); return vis; },
        qdata = null, // rolled-up data to serve as base for all queries
        timeoutID;

    // retrieve query data
    g.qdata = function() { return qdata; };

    // compute rollup of query data
    function qrollup(g, data) {
        // first collect all the bins
        var bins = {}, keys, qd;
        g.forEach(function(p) { p.fields().forEach(function(f,i) {
            bins[f] = p.query().dims[i];
        }); });
        keys = d3.keys(bins).sort();
        qd = data.sparse_query({
          dims: keys.map(function(k) { return bins[k]; }),
          vals: [dv.count("*")]
        });
        var table = dv.table();
        qd.forEach(function(c,i) {
            table.addColumn(i, c, dv.type[i==qd.length-1?"numeric":"ordinal"]);
        });
        return table;
    }

    // initialize this profiler instance
    g.init = function() {
        qdata = qrollup(g, data);
        g.forEach(function(p) { p.update(); });
    }

    // run a performance benchmark on the current instance
    g.benchmark = function(callback) {
        if (!console || !window.webkitRequestAnimationFrame) {
            alert("Sorry, the benchmarks require Google Chrome.");
            return;
        }
        var bd = {};
        bd.frames = [];
        bd.select = [];
        bd.render = [];
    
        var gi=-1, f;
        var bins = qdata[0].lut, idx=0, inc=0, count=0;
        var t0, t1, t2;

        function printstats() {
            var af = d3.sum(bd.frames) / bd.frames.length;
            var as = d3.sum(bd.select) / bd.select.length;
            var ar = d3.sum(bd.render) / bd.render.length;
            var sf = bd.frames.reduce(function(a,b) { return a + b*b; }, 0);
            var ss = bd.select.reduce(function(a,b) { return a + b*b; }, 0);
            var sr = bd.render.reduce(function(a,b) { return a + b*b; }, 0);
            var df = Math.sqrt(sf/bd.frames.length - af*af);
            var ds = Math.sqrt(ss/bd.frames.length - as*as);
            var dr = Math.sqrt(sr/bd.frames.length - ar*ar);
            console.log([af,df,as,ds,ar,dr]
                .map(function(d) { return d.toFixed(3); }).join(","));
        }

        var next = function() {
          for (++gi; g[gi] && g[gi].fields().length==2; ++gi);
          if (gi >= g.length) {
              printstats();
              callback();
              return;
          }
          f = g[gi].fields()[0];
          bins = qdata[f].lut;
          idx = 0; count = 0; inc = bins[1]-bins[0];
          step();
        }

        var step = function() {
            t0 = Date.now();
            if (count > 0) {
                bd.frames.push(t0-t1);
                bd.render.push(t0-t2);
            }
            var r = {};
            r[f] = [bins[idx], bins[idx]+inc];
            r[f].ex = (idx == bins.length-1);
            idx = (idx + 1) % (bins.length);
            count++;
            t1 = Date.now();
            g.select({source:g[gi], range:r}, -1);
            t2 = Date.now();
            if (count < 5*(qdata[f].lut.length)+1) {
                bd.select.push(t2-t1);
                  window.webkitRequestAnimationFrame(step);
            } else { next(); }
        }
        next();
        return bd;
    }

    // add a plot to this profiler instance
    g.plot = function() {
        var type = arguments[0], args = [];
        for (var i=1; i<arguments.length; ++i)
            args.push(arguments[i]);
        return add(dv[type].apply(g, args));
    }

    // initiate a brushing and linking selection
    g.select = function(sel, delay) {
        clearTimeout(timeoutID);
        if (delay === -1) { dispatch(sel); return; }
        delay = delay || 1;
        // include a short delay to avoid visual "bounce" and
        // prevent unnecessary processing of multiple events
        timeoutID = setTimeout(function() { dispatch(sel); }, delay);
    }
    function dispatch(s) {
        var e = {data: null, cache:{}}, rn = s.range;
        if (rn != null) {
            var fields = [], f, x, filter = null;
            for (f in rn) fields.push(f);

            if (fields.length == 1) {
                f = fields[0]; x = rn[f];
                var a = x[0], b = x[1], ex = x.ex;
                filter = function(t,r) {
                    var v = t[f].lut[t[f][r]];
                    return a <= v && v < b && (ex || v != b);
                };
            } else {
                filter = function(t,r) {
                    for (var i=0, len = fields.length; i<len; ++i) {
                        var f = fields[i], x = rn[f], v = t[f].lut[t[f][r]];
                        if (x[0] > v || v > x[1] || (!x.ex && v == x[1]))
                        return false;
                    }
                    return true;
                };
            }
            e.data = qdata.where(filter);
        }
        for (var i=0; i<g.length; ++i) {
            if (g[i] !== s.source) g[i].select(e);
            else g[i].select({data:null});
        }
    }

    g.data = data;
    return g;
};

// Histogram visualization component
dv.histogram = function(id, fields, opt)
{    
    var group = this,
        hist = {},
        data = group.data, roll,
        field = fields[0],
        bins = opt.bins || 10,
        xbins = bins,
        w = opt.width || 400,
        h = opt.height || 194,
        b, step, min, max, q, qb, y, vis;

    hist.initUI = function() {
        d3.select("#"+id+" svg").remove();
        vis = d3.select("#"+id).append("svg:svg")
            .attr("width", w)
            .attr("height", h);
    };

    hist.initBins = function() {
        var bin = dv_bins(data[field], bins, opt.min, opt.max, opt.step);
        min = bin[0]; max = bin[1]; step = bin[2];
        xbins = Math.ceil((max - min) / step);

        b = dv.bin(field, step, min, max);
        q = {dims:[b], vals:[dv.count("*")]};
        qb = {dims:[field], vals:[dv.sum(data.length)]};
    };

    hist.query = function() { return q; }

    hist.update = function() {
        function mouseout() {
            d3.select(this).style("fill", null);
            group.select({source:hist});
        }
        function mouseover(d, i) {
            d3.select(this).style("fill", "red");
            var v = roll[0][i],
                r = {};
            r[field] = [v, v+step];
            r[field].ex = Math.abs(v+step - max) < dv.EPSILON;
            group.select({source:hist, range:r});
        }

        roll = group.qdata().query(qb);
        var idx = d3.range(roll[0].length),
            s = Math.floor(w / xbins + 0.5);

        y = d3.scale.linear()
            .domain([0, d3.max(roll[1])])
            .range([h, 0]);

        vis.selectAll("rect.base")
            .data(idx)
          .enter().append("svg:rect")
            .attr("class", "base")
            .on("mouseover", mouseover)
            .on("mouseout", mouseout);

        vis.selectAll("rect.base")
            .attr("x", function(i) { return s*i; })
            .attr("y", function(i) { return y(roll[1][i]); })
            .attr("width", s-1)
            .attr("height", function(i) { return h - y(roll[1][i]); });

        vis.selectAll("rect.brush")
            .data(idx)
          .enter().append("svg:rect")
            .attr("class", "brush");

        vis.selectAll("rect.brush")
           .attr("x", function(i) { return s*i; })
           .attr("y", h)
           .attr("width", s-1)
           .attr("height", 0);
    };

    hist.select = function(e) {
        if (e.data) {
            var roll = dv_profile_cache(e, qb);
            vis.selectAll("rect.brush")
                .attr("y", function(d,i) {
                    var val = y(roll[1][i]);
                    return val < h && h - val < 2 ? h-2 : val;
                })
               .attr("height", function(d,i) {
                   var val = h - y(roll[1][i]);
                   return val > 0 && val < 2 ? 2 : val;
               });
        } else {
            vis.selectAll("rect.brush")
                .attr("height", 0);
        }
    };

    hist.rollup = function() { return roll; };

    hist.fields = function() {
        if (arguments.length == 0) return fields;
        fields = arguments;
        field = fields[0];
        return hist;
    };

    hist.options = function() {
        if (arguments.length == 0) return fields;
        opt = arguments[0];
        bins = opt.bins || bins;
        w = opt.width || w;
        h = opt.height || h;
        hist.update();
        return hist;
    };

    hist.type = function() { return "histogram"; };

    hist.initUI();
    hist.initBins();
    return hist;
};

// Binned scatterplot visualization component
dv.scatter = function(id, fields, opt)
{
    var group = this,
        scat = {},
        data = group.data, roll, sroll,
        xfield = fields[0],
        yfield = fields[1],
        bins = opt.bins || 10,
        xbins = 0, ybins = 0,
        w = opt.width || 400,
        h = opt.height || 400,
        bx, by, xstep, ystep, q, qb,
        x, y, o, vis, xmin, xmax, ymin, ymax, squareWidth, squareHeight;

    scat.query = function() { return q; };

    function indices(t) {
        var idx = [], len = t[2].length;
        for (var i=0; i<len; ++i) {
            if (t[2][i] > 0) idx.push(i);
        }
        return idx;
    }

    scat.initUI = function() {
        d3.select("#"+id+" svg").remove();
        vis = d3.select("#"+id).append("svg:svg")
            .attr("width", w)
            .attr("height", h);
    };

    scat.initBins = function() {
        var xbin = dv_bins(data[xfield], bins,
            opt.xmin, opt.xmax, opt.xstep);
        xmin = xbin[0]; xmax = xbin[1]; xstep = xbin[2];
        bx = dv.bin(xfield, xstep, xmin, xmax);

        var ybin = dv_bins(data[yfield], bins,
            opt.ymin, opt.ymax, opt.ystep);
        ymin = ybin[0]; ymax = ybin[1]; ystep = ybin[2];
        by = dv.bin(yfield, ystep, ymin, ymax);

        scat.xbin = xbin;
        scat.ybin = ybin;
        xbins = Math.ceil((xmax-xmin)/xstep);
        ybins = Math.ceil((ymax-ymin)/ystep);

        q = {dims:[bx, by], vals:[dv.count("*")]};
        qb = {dims:[xfield, yfield], vals:[dv.sum(data.length)]};
    };

    scat.update = function() {
        function opacity(i) {
            var v = roll[2][i];
            return v==0 ? 0 : o(v);
        }
        function mouseout() {
            d3.select(this)
                .style("fill", null)
                .attr("fill-opacity", opacity);
            group.select({source:scat});
        }
        function mouseover(i) {
            d3.select(this)
                .style("fill", "red")
                .attr("fill-opacity", 1);
            var vx = roll[0][i], vy = roll[1][i], r = {};
            r[xfield] = [vx, vx + xstep];
            r[xfield].ex = Math.abs(vx + xstep - xmax) < dv.EPSILON;
            r[yfield] = [vy, vy + ystep];
            r[yfield].ex = Math.abs(vy + ystep - ymax) < dv.EPSILON;
            group.select({source:scat, range: r});
        }

        roll = group.qdata().query(qb); //data.query(q);

        var sx = Math.floor((w-10)/xbins + 0.5),
            sy = Math.floor(h/ybins + 0.5),
            sw = sx * xbins,
            sh = sy * ybins;

        x = d3.scale.linear().domain([xmin, xmax]).range([0, sw]);
        y = d3.scale.linear().domain([ymin, ymax]).range([sh-sy, -sy]);
        o = d3.scale.linear().domain([0, d3.max(roll[2])]).range([0.15,1]);

        var sel = vis.selectAll("rect.base")
            .data(indices(roll));
        sel.enter().append("svg:rect")
            .attr("class", "base")
            .on("mouseover", mouseover)
            .on("mouseout", mouseout);
        sel.exit().remove();

        vis.selectAll("rect.base")
            .attr("x", function(i) { return x(roll[0][i]); })
            .attr("y", function(i) { return y(roll[1][i]); })
            .attr("width", sx)
            .attr("height", sy)
            .attr("fill-opacity", opacity);

        squareWidth = Math.floor((w-10)/xbins + 0.5)
        squareHeight = Math.floor(h/ybins + 0.5)
        vis.selectAll("rect.brush")
            .data(indices(roll))
         .enter().append("svg:rect")
            .attr("class", "brush")
            .attr("pointer-events", "none")
            .attr("fill-opacity", 0)
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", squareWidth)
            .attr("height", squareHeight);
    };

    scat.select = function(e) {
        if (e.data) {
            var sd = dv_profile_cache(e, qb); // selected data
            var c = d3.scale.linear()
                .domain([0,d3.max(sd[2])])
                .range([0.15,1]);      
            var sel = vis.selectAll("rect.brush")
                .data(indices(sd))
                .attr("x", function(i) { return x(sd[0][i]); })
                .attr("y", function(i) { return y(sd[1][i]); })
                .attr("fill-opacity", function(i) { return c(sd[2][i]); });        
            sel.exit()
                .attr("fill-opacity", 0);
        } else {
            vis.selectAll("rect.brush")
                .attr("fill-opacity", 0);
        }
    };

    scat.rollup = function() { return roll; };

    scat.fields = function() {
        if (arguments.length == 0) return fields;
        fields = arguments;
        xfield = fields[0];
        yfield = fields[1] || xfield;
        return scat;
    };

    scat.options = function() {
        if (arguments.length == 0) return fields;
        opt = arguments[0];
        bins = opt.bins || bins;
        w = opt.width || w;
        h = opt.height || h;
        scat.update();
        return scat;
    };

    scat.type = function() { return "scatter"; };

    scat.initUI();
    scat.initBins();
    return scat;
};