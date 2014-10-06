var dv = (function() {
/**
 * The top-level Datavore namespace. All public methods and fields should be
 * registered on this object. Note that core Datavore source is surrounded by an
 * anonymous function, so any other declared globals will not be visible outside
 * of core methods. This also allows multiple versions of Datavore to coexist,
 * since each version will see their own <tt>dv</tt> namespace.
 *
 * @namespace The top-level Datavore namespace, <tt>dv</tt>.
 */
var dv = {version: "1.1.0"};

dv.array = function(n) {
    var a = Array(n);
    for (var i = n; --i >= 0;) { a[i] = 0; }
    return a;
}

// -- RANDOM NUMBER GENERATORS ------------------------------------------------

dv.rand = {};

dv.rand.uniform = function(min, max) {
    min = min || 0;
    max = max || 1;
    var delta = max - min;
    return function() {
        return min + delta * Math.random();
    }
};

dv.rand.integer = function(a, b) {
    if (b === undefined) {
        b = a;
        a = 0;
    }
    return function() {
        return a + Math.max(0, Math.floor(b * (Math.random() - 0.001)));
    }
}

dv.rand.normal = function(mean, stdev) {
    mean = mean || 0;
    stdev = stdev || 1;
    var next = undefined;
    return function() {
        var x = 0, y = 0, rds, c;
        if (next !== undefined) {
            x = next;
            next = undefined;
            return x;
        }
        do {
            x = Math.random() * 2 - 1;
            y = Math.random() * 2 - 1;
            rds = x * x + y * y;
        } while (rds == 0 || rds > 1);
        c = Math.sqrt(-2 * Math.log(rds) / rds); // Box-Muller transform
        next = mean + y * c * stdev;
        return mean + x * c * stdev;
    }
}
// -- DATA TABLE --------------------------------------------------------------

dv.type = {
    nominal: "nominal",
    ordinal: "ordinal",
    numeric: "numeric",
    unknown: "unknown"
};

dv.table = function(input)
{
    var table = []; // the data table
    
    table.addColumn = function(name, values, type, iscolumn) {
        var compress,    // Flag for compressed type of columns
            j,           // Loop counter
            len,         // Loop length
            isMultiple,  // Flag for multiple values
            rows = [],   // Array of rows (the elements)
            vals;        // Array of values

        type = type || dv.type.unknown;
        compress = (type === dv.type.nominal || type === dv.type.ordinal);
        vals = values;

        if (!iscolumn) {
            vals = [];

            // Loop values to normalize them and separate multiple values
            // There is a value for each row (even if 2 rows have the same value)
            len = values.length;
            for (j = 0; j < len; j += 1) {
                value = values[j];   // Get current Value
                isMultiple = false;  // Update flag for multiple values

                // If type is not numeric, replace null and undefined values with the empty string
                if (type !== dv.type.numeric && (typeof value === 'undefined' || value === null)) {
                    value = nullStringValue;
                } else {
                    // Check if the value is a String
                    if (typeof value === 'string') {
                        // Check if the value is double-quoted to remove quotes
                        if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                            value = value.substring(1, value.length - 1);
                            values[j] = value; // Update item in the array
                        } else {
                            // If the value isn't double-quoted, look for multiple values: check if the value has a comma
                            if (value.indexOf(',') >= 0) {
                                isMultiple = true; // Update flag for multiple values

                                // If the value has a comma, split it and save it as an array
                                singleValues = value.split(',');

                                // Trim all values
                                singleValues = singleValues.map(function (str) {
                                    return str.trim();
                                });

                                // Remove the global multiple value and add the obtained single values in the array of values
                                values = values.slice(0, j).concat(singleValues).concat(values.slice(j + 1));
                                j   += singleValues.length - 1; // Update counter of the for loop
                                len += singleValues.length - 1; // Update length  of the for loop
                            }
                        }
                    }
                }

                // If the value is not a multiple value, add the row with the value as it is (in the row with index j)
                // If it is a multiple value, add the array of values
                // The rows resulting array will be like: [0: 'food', 1: 'dog', 2: ['tree', 'food'], 3: 'food', 4: 'dog']
                if (!isMultiple) {
                    rows.push(value);
                } else {
                    rows.push(singleValues);
                }
            }

            // Get the array of possible values. It deletes duplicates, so that each value is present exactly one time.
            // Example: [0: 'tree', 1: 'food', 2: 'dog']
            vals.lut = code(values);

            // Create a map for possible values (an object that can be used to get the index of a value from the value itself)
            // Example: { 'tree': 0, 'food': 1, 'dog': 2}
            map = dict(vals.lut);

            // Loop rows and get for each row the indexes of values
            len = rows.length;
            for (j = 0; j < len; j++) {
                // If the row is an array, the element has a multiple value, so it adds an array with the correspondent values
                // If it is a single value, it adds only the index of the single correspondent value
                if (Array.isArray(rows[j])) {
                    // Get the indexes of correspondent values from the map
                    rows[j] = rows[j].map(function (singleValue) {
                        return map[singleValue];
                    })

                    // Add the array of indexes
                    vals.push(rows[j]);
                } else {
                    // Get the index of the correspondent value from the map and save it
                    vals.push(map[rows[j]]);
                }
            }

            // Define the method to get values from the Column
            // If the flag requestString is true, it returns a String.
            // Otherwise it returns the values as they are (they can be arrays for multiple values)
            vals.get = function(idx, requestString) {
                var self = this,            // Own reference for inner functions
                    result,                 // Value to return
                    valueIndex = this[idx]; // Get the index of the value

                // If it is a single value, return it.
                // If it is a multiple value, return an array of values.
                if (!Array.isArray(valueIndex)) {
                    result = self.lut[valueIndex]; 

                    // If requested, convert the value to string
                    if (requestString) {
                        result = result !== null ? result.toString() : result;
                    }
                } else {
                    result = [];
                    valueIndex.forEach(function (i) {
                        result.push(self.lut[i]);
                    });

                    // If requested, join the array separating values with comma
                    if (requestString) {
                        result = result.join(', ');
                    }
                }
                return result;
            }
        }

        vals.name = name;
        vals.index = table.length;
        vals.type = type;

        table.push(vals);
        table[name] = vals;
    };
    
    table.removeColumn = function(col) {
        col = table[col] || null;
        if (col != null) {
            delete table[col.name];
            table.splice(col.index, 1);
        }
        return col;
    };
    
    table.rows = function() { return table[0] ? table[0].length : 0; };

    table.cols = function() { return table.length; };

    table.get = function(col, row) { return table[col].get(row); }

    table.dense_query = function(q) {
        var tab = q.where ? table.where(q.where) : table;
        var dims = [], sz = [1], hasDims = q.dims;
        if (hasDims) {
            sz = [];
            for (i = 0; i < q.dims.length; ++i) {
                var dim = q.dims[i], type = typeof dim;
                if (type === "string" || type === "number") {
                    col = tab[dim];
                } else if (dim.array) {
                    col = dim.array(tab[dim.value]);
                }
                dims.push(col);
                sz.push(col.lut.length);
            }
        }
        
        var vals = q.vals,  // aggregate query operators
            C = sz.reduce(function(a,b) { return a * b; }, 1), // cube cardinality
            N = tab[0].length, p, col, v, name, expr,        // temp vars
            cnt, sum, ssq, min, max,            // aggregate values
            _cnt, _sum, _ssq, _min, _max,       // aggregate flags
            ctx = {}, emap = {}, exp = [], lut, // aggregate state vars
            i = 0, j = 0, k = 0, l = 0, idx = 0, mv = 0, len, slen = sz.length, mvlen; // indices        

        // Identify Requested Aggregates
        var star = false;
        for (i = 0; i < vals.length; ++i) {
            var req = vals[i].init();
            for (expr in req) {
                if (expr == "*") { // current val is dv.count()
                    req[expr].map(function(func) { // req[expr] is ["cnt"]
                        ctx[func] = dv.array(C);   // Writes the property ctx["cnt"]; - that is the count -> how many elements has this value
                    });
                    star = true;
                } else {
                    idx = tab[expr].index;
                    name = tab[expr].name;
                    req[expr].map(function(func) {
                        ctx[func + "_" + name] = (ctx[func + "_" + idx] = dv.array(C));
                    });
                    if (!emap[idx]) {
                        emap[idx] = true;
                        exp.push(idx);
                    }
                }
            }
        }

        if (exp.length == 0 && star) { exp.push(-1) };

        // Compute Cube Index Coefficients
        for (i = 0, p = [1]; i < slen; ++i) {
            p.push(p[i] * sz[i]);
        }
        
        // Execute Query: Compute Aggregates
        for (j = 0, len = exp.length; j < len; ++j) {
            expr = exp[j];
            cnt = ctx["cnt"]; _cnt = (cnt && j==0);
            sum = ctx["sum_" + expr]; _sum = (sum !== undefined);
            ssq = ctx["ssq_" + expr]; _ssq = (ssq !== undefined);
            min = ctx["min_" + expr]; _min = (min !== undefined);
            max = ctx["max_" + expr]; _max = (max !== undefined);
            col = tab[expr];
outer:            
            for (i = 0; i < N; ++i) { // Loop all elements (N: number of elements)
                for (idxes = [], k = 0; k < slen; ++k) { // Loop all dims
                    // compute cube index
                    l = (hasDims ? dims[k][i] : 0); // Get the index of the value for the current element
                    if (l < 0) continue outer;

                    // if the index is an array (multiple value), consider each element
                    if (Object.prototype.toString.call(l) === '[object Array]') {
                        mvlen = l.length;
                        for (mv = 0; mv < mvlen; ++mv) { // Loop all single values of the multiple value
                            if (typeof idxes[mv] === 'undefined') {
                                idxes[mv] = 0;           // Initialize it if it doesn't exist
                            }
                            idxes[mv] += p[k] * l[mv];   // Get the index of each single value
                        }

                    // If it is a single value, add it as the first element of the array of indexes
                    } else {
                        // Initialize it if it doesn't exist
                        if (typeof idxes[mv] === 'undefined') {
                            idxes[0] = 0;
                        }
                        idxes[0] += p[k] * l; // Get the index of the value
                    }
                }

                // Loop found indexes
                // (there will be only one index for single values, more indexes for multiple values)
                mvlen = idxes.length;
                for (k = 0; k < mvlen; ++k) {
                    if (col) { v = col[i]; }
                    if (_cnt) { cnt[idxes[k]] += 1; }
                    if (_sum) { sum[idxes[k]] += v; }
                    if (_ssq) { ssq[idxes[k]] += v * v; }
                    if (_min && v < min[idxes[k]]) { min[idxes[k]] = v; }
                    if (_max && v > max[idxes[k]]) { max[idxes[k]] = v; }
                }
            }
        }

        // Generate Results
        var result = [], stride = 1, s, val, code = q.code || false;
        for (i = 0; i < dims.length; ++i) {
            col = [];
            lut = dims[i].lut;
            s = sz[i];
            val = 0;
            for (j = 0, k = 0, c = -1; j < C; ++j, ++k) {
                if (k == stride) { k = 0; val = (val + 1) % s; }
                col[j] = code ? val : lut[val];
            }
            stride *= s;
            col.unique = lut.length;
            result.push(col);
        }
        vals.map(function(op) { result.push(op.done(ctx)); });
        return result;
    };

    table.query = table.dense_query;

    table.sparse_query = function(q) {
        var tab = q.where ? table.where(q.where) : table;
        var dims = [], sz = [1], hasDims = q.dims;
        if (hasDims) {
            sz = [];
            for (i=0; i<q.dims.length; ++i) {
                var dim = q.dims[i], type = typeof dim;
                if (type === "string" || type === "number") {
                    col = tab[dim];
                } else if (dim.array) {
                    col = dim.array(tab[dim.value]);
                }
                dims.push(col);
                sz.push(col.lut.length);
            }
        }

        var vals = q.vals,  // aggregate query operators
            C = sz.reduce(function(a,b) { return a*b; }, 1), // cube cardinality
            N = tab[0].length, p, col, v, name, expr,      // temp vars
            cnt, sum, ssq, min, max,            // aggregate values
            _cnt, _sum, _ssq, _min, _max,       // aggregate flags
            ctx = {}, emap = {}, exp = [], lut, // aggregate state vars
            i = 0, j = 0, k = 0, l = 0, idx = 0, len, slen = sz.length; // indices        

        // Identify Requested Aggregates
        var star = false;
        for (i = 0; i < vals.length; ++i) {
            var req = vals[i].init();
            for (expr in req) {
                if (expr == "*") {
                    req[expr].map(function(func) {
                        ctx[func] = {};
                    });
                    star = true;
                } else {
                    idx = tab[expr].index;
                    name = tab[expr].name;
                    req[expr].map(function(func) {
                        ctx[func + "_" + name] = (ctx[func + "_" + idx] = {});
                    });
                    if (!emap[idx]) {
                        emap[idx] = true;
                        exp.push(idx);
                    }
                }
            }
        }
        if (exp.length == 0 && star) { exp.push(-1) };

        // Compute Cube Index Coefficients
        for (i = 0, p=[1]; i < slen; ++i) {
            p.push(p[i] * sz[i]);
        }
        // Execute Query: Compute Aggregates
        for (j = 0, len = exp.length; j < len; ++j) {
            expr = exp[j];
            cnt = ctx["cnt"]; _cnt = (cnt && j==0);
            sum = ctx["sum_" + expr]; _sum = (sum !== undefined);
            ssq = ctx["ssq_" + expr]; _ssq = (ssq !== undefined);
            min = ctx["min_" + expr]; _min = (min !== undefined);
            max = ctx["max_" + expr]; _max = (max !== undefined);
            col = tab[expr];
outer:            
            for (i = 0; i < N; ++i) {
                for (idx = 0, k = 0; k < slen; ++k) {
                    // compute cube index
                    l = (hasDims ? dims[k][i] : 0);
                    if (l < 0) continue outer;
                    idx += p[k] * l;
                }
                if (col) { v = col[i]; }
                if (_cnt) {
                    if (cnt[idx] === undefined) { cnt[idx]=0; }
                    cnt[idx] += 1;
                }
                if (_sum) {
                    if (sum[idx] === undefined) { sum[idx]=0; }
                    sum[idx] += v;
                }
                if (_ssq) {
                    if (ssq[idx] === undefined) { ssq[idx]=0; }
                    ssq[idx] += v * v;
                }
                if (_min && (min[idx] === undefined || v < min[idx])) {
                    min[idx] = v;
                }
                if (_max && (max[idx] === undefined || v > max[idx])) {
                    max[idx] = v;
                }
            }
        }

        // Generate Results
        var rr = vals.map(function(op) { return op.done(ctx); });
        var keys = rr[0];
        if (rr.length > 1) {
            keys = {};
            rr.forEach(function(o) { for (var k in o) keys[k] = 1; });
        }
        var result = dims.map(function() { return []; });
        vals.forEach(function() { result.push([]); });
        len = dims.length;

        for (k in keys) {
            // map index i to dimensional indices
            var nn = C, uv, div;
            for (i = k, j = len; --j >= 0;) {
                uv = dims[j].lut.length;
                div = ~~(nn / uv);
                result[j].push(dims[j].lut[~~(i / div)]);
                i = i % div;
                nn = ~~(nn / uv);
            }
            for (j = 0; j < rr.length; ++j) {
                val = rr[j][k];
                result[len + j].push(val === undefined ? 0 : val);
            }
        }
        return result;
    };
    
    table.where = function(f) {
        var nrows = table.rows(),
            ncols = table.cols();
        
        // initialize result table
        var result = dv.table([]);
        for (var i = 0; i < ncols; ++i) {
            result.push([]);
            result[i].name = table[i].name;
            result[i].type = table[i].type;
            result[i].index = i;
            result[table[i].name] = result[i];
            if (table[i].lut) { result[i].lut = table[i].lut; }
        }
        
        // populate result table
        for (var row = 0, j = -1; row < nrows; ++row) {
            if (f(table, row)) {
                for (i = 0, ++j; i < ncols; ++i) {
                    result[i][j] = table[i][row];
                }
            }
        }
        return result;
    };
    
    /** @private */
    function code(a) {
        var c = [], d = {}, v;
        for (var i=0, len=a.length; i<len; ++i) {
            if (d[v = a[i]] === undefined) { d[v] = 1; c.push(v); }
        }
        return typeof(c[0]) !== "number" ? c.sort()
            : c.sort(function(a,b) { return a - b; });
    };
    
    /** @private */
    function dict(lut) {
        return lut.reduce(function(a,b,i) { a[b] = i; return a; }, {});
    };

    // populate data table
    if (input) {
        input.forEach(function(d) {
            table.addColumn(d.name, d.values, d.type);    
        });
    }
    return table;
};

// -- QUERY OPERATORS ---------------------------------------------------------

dv.noop = function() {};

// -- aggregation (value) operators ---

dv.count = function(expr) {
    var op = {};
    op.init = function() {
        return {"*":["cnt"]};
    }
    op.done = function(ctx) { return ctx["cnt"]; };
    op.value = expr;
    return op;
};

dv.min = function(expr) {
    var op = {};
    op.init = function() {
        var o = {}; o[expr] = ["min"]; return o;
    }
    op.done = function(ctx) { return ctx["min_" + expr]; };
    op.value = expr;
    return op;
};

dv.max = function(expr) {
    var op = {};
    op.init = function() {
        var o = {}; o[expr] = ["max"]; return o;
    }
    op.done = function(ctx) { return ctx["max_" + expr]; };
    op.value = expr;
    return op;
};

dv.sum = function(expr) {    
    var op = {};
    op.init = function() {
        var o = {}; o[expr] = ["sum"]; return o;
    }
    op.done = function(ctx) { return ctx["sum_" + expr]; };
    op.value = expr;
    return op;
};

dv.avg = function(expr) {    
    var op = {};
    op.init = function() {
        var o = {"*":["cnt"]}; o[expr] = ["sum"]; return o;
    };
    op.done = function(ctx) {
        var akey = "avg_" + expr, avg = ctx[akey];
        if (!avg) {
            var sum = ctx["sum_" + expr], cnt = ctx["cnt"];
             if (Object.prototype.toString.call(sum) === "[object Array]") {
                ctx[akey] = (avg = sum.map(function(v,i) { return v / cnt[i]; }));
            } else {
                ctx[akey] = (avg = {});
                for (var i in sum) { avg[i] = sum[i] / cnt[i]; }
            }
        }
        return avg;
    };
    op.value = expr;
    return op;
};

dv.variance = function(expr, sample) {
    var op = {}, adj = sample ? 1 : 0;
    op.init = function() {
        var o = {"*":["cnt"]}; o[expr] = ["sum","ssq"]; return o;
    };
    op.done = function(ctx) {
        var cnt = ctx["cnt"], sum = ctx["sum_" + expr], ssq = ctx["ssq_" + expr];
        var akey = "avg_" + expr, avg = ctx[akey];

        if (!avg) {
            if (Object.prototype.toString.call(sum) === "[object Array]") {
                ctx[akey] = (avg = sum.map(function(v,i) { return v / cnt[i]; }));
            } else {
                ctx[akey] = (avg = {});
                for (var i in sum) { avg[i] = sum[i] / cnt[i]; }
            }
        }
        if (Object.prototype.toString.call(ssq) === "[object Array]") {
            return ssq.map(function(v,i) {
                return v / cnt[i] - avg[i] * avg[i];
            });
        } else {
            var va = {};
            for (var i in ssq) { va[i] = ssq[i] / cnt[i] - avg[i] * avg[i]; }
            return va;
        }
    };
    op.value = expr;
    return op;
};

dv.stdev = function(expr, sample) {
    var op = dv.variance(expr, sample), end = op.done;
    op.done = function(ctx) {
        var dev = end(ctx);
        if (Object.prototype.toString.call(dev) === "[object Array]") {
            for (var i = 0; i < dev.length; ++i) { dev[i] = Math.sqrt(dev[i]); }
        } else {
            for (var i in dev) { dev[i] = Math.sqrt(dev[i]); }
        }
        return dev;
    }
    return op;
};

// -- dimension operators ---

dv.bin = function(expr, step, min, max) {
    var op = {};
    op.array = function(values) {
        var N = values.length, val, idx, i,
            minv = min, maxv = max, minb = false, maxb = false;
        if (minv === undefined) { minv = Infinity; minb = true; }
        if (maxv === undefined) { maxv = -Infinity; maxb = true; }
        if (minb || maxb) {
            for (i = 0; i < N; ++i) {
                val = values[i];
                if (minb && val < minv) { minv = val; }
                if (maxb && val > maxv) { maxv = val; }
            }
            if (minb) { minv = Math.floor(minv / step) * step; }
            if (maxb) { maxv = Math.ceil(maxv / step) * step; }
        }
        // compute index array
        var a = [], lut = (a.lut = []),
            range = (maxv - minv), unique = Math.ceil(range / step);
        for (i = 0; i < N; ++i) {
            val = values[i];
            if (val < minv || val > maxv) { a.push(-1); }
            else if (val == maxv) { a.push(unique - 1); }
            else { a.push(~~((values[i] - minv) / step)); }
        }
        for (i = 0; i < unique; ++i) {
            // multiply b/c adding garners round-off error
            lut.push(minv + i * step);
        }
        return a;
    };
    op.step = function(x) {
        if (x === undefined) return step;
        step = x;
        return op;
    };
    op.min = function(x) {
        if (x === undefined) return min;
        min = x;
        return op;
    };
    op.max = function(x) {
        if (x === undefined) return max;
        max = x;
        return op;
    };
    op.value = expr;
    return op;
};

dv.quantile = function(expr, n) {    
    function search(array, value) {
        var low = 0, high = array.length - 1;
        while (low <= high) {
            var mid = (low + high) >> 1, midValue = array[mid];
            if (midValue < value) { low = mid + 1; }
            else if (midValue > value) { high = mid - 1; }
            else { return mid; }
        }
        var i = -low - 1;
        return (i < 0) ? (-i - 1) : i;
    }

    var op = {};
    op.array = function(values) {
        // get sorted data values
        var i, d = values.sorted;
        if (!d) {
            var cmp;
            if (values.type && values.type === "numeric") {
                cmp = function(a,b) { return a - b; }
            } else {
                cmp = function(a,b) { return a < b ? -1 : a > b ? 1 : 0; }
            }
            values.sorted = (d = values.slice().sort(cmp));
        }
        // compute quantile boundaries
        var q = [d[0]], a = [], lut = (a.lut = []);
        for (i = 1; i <= n; ++i) {
            q[i] = d[~~(i * (d.length - 1) / n)];
            lut.push(i - 1);
        }
        // iterate through data and label quantiles
        for (i = 0; i < values.length; ++i) {
            a.push(Math.max(0, search(q, values[i]) - 1));
        }
        return a;
    }
    op.bins = function(x) {
        if (x === undefined) return n;
        n = x;
        return op;
    }
    op.value = expr;
    return op;
};

return dv; })();
