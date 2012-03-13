function generate_data(N) {
    function randn(n) {
        return Math.max(0, Math.floor(n*(Math.random()-0.001)));
    }

    // generate synthetic data set
    var cols = [[],[],[]],  // data columns
        am = ["a","b","c"], // domain of 1st col
        bm = d3.range(1,6); // domain of 2nd col

    // generate rows from random data
    for (var i=0; i<N-1; ++i) {
        cols[0].push(am[randn(am.length)]);
        cols[1].push(bm[randn(bm.length)]);
        cols[2].push(randn(10000));
    }

    // add one extra row to introduce sparsity
    cols[0].push("d");
    cols[1].push(1);
    cols[2].push(10);

    // construct datavore table
    var names = ["a","b","x"],                   // column names
        types = ["nominal","nominal","numeric"]; // dv.type constants
    return dv.table(cols.map(function(d,i) {
        return {name:names[i], type:types[i], values:d};
    }));
}