# Datavore

**Datavore** is a small in-browser database engine written in JavaScript.
Datavore enables you to perform fast aggregation queries within web-based 
analytics or visualization applications. Datavore consists of an in-memory
column-oriented database implemented using standard JavaScript arrays. The
system provides support for filtering and group-by aggregation queries. When
run within an optimized JavaScript environment, Datavore can complete queries
over million-element data tables at interactive (sub-100ms) rates.

### Getting Started

Simply reference the script `dv.js` within your web page to import Datavore.
The included example files include demonstrations of Datavore's functionality
along with performance benchmarks. The `profile` example shows how Datavore
can be used to support high-performance brushing and linking among
visualizations using the [D3](http://github.com/mbostock/d3) framework.

### Creating A Datavore Table

A Datavore table is simply a collection of data columns, each realized as a
JavaScript array. To create a table instance, you can either initialize the
full table through the constructor or add columns one-by-one. For instance:

    var colA = ["a","a","b","b","c"];
    var colB = [0,1,2,3,4];
    
    // create a table in one call by bundling up columns
    var tab1 = dv.table([
        {name:"A", values:colA, type:dv.type.nominal},
        {name:"B", values:colB, type:dv.type.numeric}
    ]);

    // create a table adding one column at a time
    // the resulting 'tab2' should be identical to 'tab1'
    var tab2 = dv.table();
    tab2.addColumn("A", colA, dv.type.nominal);
    tab2.addColumn("B", colB, dv.type.numeric);

In addition to the column name and array of values, each column must have a
specified data type, one of `dv.type.nominal`, `dv.type.ordinal`, 
`dv.type.numeric`, or `dv.type.unknown`. Numeric means the column contains numbers
that can be aggregated (e.g., summed, averaged, etc). Nominal values are
category labels without a meaningful sort order, while ordinal values can be 
meaningfully sorted.

Datavore treats nominal and ordinal data in a special way: it recodes the
input array values as zero-based integers (much like a
[star schema](http://en.wikipedia.org/wiki/Star_schema)). The unique values
in the input array are sorted and placed into a lookup table. Mapping strings
and other data types to integer codes enables faster query performance.

### Accessing Table Values

You can access values within a Datavore table directly via array indices or
through the table `get` method. For nominal or ordinal types, direct access will 
return coded integers. The `get` method always returns the original value.

    // both array indices and the "get" method use (column, row) ordering
    alert(tab1[0][1]);    // 1st column, 2nd row, coded   --> prints "0"
    alert(tab1.get(0,1)); // 1st column, 2nd row, uncoded --> prints "a"

    // directly accessing the lookup table (lut) to decode a value
    // included for demo purposes only; use the "get" method instead!
    // 1st column, 2nd row, uncoded --> prints "a"
    alert(tab1[0].lut[tab1[0][1]]);

You can either access columns by their numerical index (as above) or by name:

    // accessing table values by column name
    alert(tab1["A"][1]);    // 1st column, 2nd row, coded   --> prints "0"
    alert(tab1.get("A",1)); // 1st column, 2nd row, uncoded --> prints "a"

**WARNING**: *Datavore column names should NOT be numbers.* If you use column 
names that JavaScript can interpret as integer values ("00") you will likely
experience unexpected (and undesirable) behavior.

### Filtering Queries

Datavore tables support two kinds of queries: filtering operations and
group-by aggregation. Filtering queries simply filter table contents
according to a predicate function; these are similar to simple SQL queries
with a WHERE clause. The filtering function takes a table instance and row
number as arguments and returns a new Datavore table instance.

    // creates a new table with 3 rows: [["b","b","c"], [2,3,4]]
    var filtered_table = tab1.where(function(table, row) {
        return table.get("B", row) > 1;
    });

*NOTE*: To ensure that tables created by various filtering queries are
compatible with each other, nominal and ordinal columns within the result
tables will always have the same lookup table as the original table, even if
some unique values have been completely filtered out. As a result you may
see some unexpected zero values returned when running dense aggregation
queries on filtered tables.

### Aggregation Queries

The primary use case for Datavore is running aggregation queries. These queries
allow you to calculate counts, sums, averages, standard deviations, and minimum
or maximum values for a column, optionally grouped according to nominal or
ordinal dimensions. These queries are similar to SQL queries with group-by clauses.

    // count all rows in the table -> returns [[5]]
    var counts = tab1.query({vals:[dv.count()]});

    // count rows and sum values in 2nd column, grouped by 1st column
    // returns -> [["a","b","c"], [2,2,1], [1,5,4]]]
    var groups = tab1.query({dims:[0], vals:[dv.count(), dv.sum(1)]});

    // same as before, but now with extra parameter "code:true"
    // nominal/ordinal types remain coded integers, NOT original values
    // returns -> [[0,1,2], [2,2,1], [1,5,4]]]
    var uncode = tab1.query({dims:[0], vals:[dv.count(), dv.sum(1)], code:true});

    // count all table rows where first column != "a"
    // returns -> [["a","b","c"], [0,2,1]]
    var filter = tab1.query({dims:[0], vals:[dv.count()], where:
        function(table, row) { return table.get("A",row) != "a"; }
    });

The return value of the `query` method is an array of arrays. Note that the
return value is *not* a Datavore table object. The input to the query method
should be a JavaScript object with up to four parameters: `vals` (required),
`dims`, `where`, and `code`.

The `vals` parameter indicates the aggregation functions to run. The
available operators are `dv.count`, `dv.sum`, `dv.min`, `dv.max`, `dv.avg`,
`dv.variance`, and `dv.stdev`. All aggregation operators accept a single column
index or name as input (except for `dv.count`, which ignores any input).

The `dims` parameter indicates the dimensions to group by. This
should be an array containing column indices, column names or special dimension
query operators (`dv.bin` or `dv.quantile`).

The `where` parameter specifies a predicate function for filtering the
table (as in `where` queries). Filtering is performed *prior* to aggregation.

If true, the `code` parameter indicates that nominal and ordinal values
should be left as coded integers. If false (the default), coded integers are
mapped back to the original values in the query result arrays.

#### Dense Queries vs. Sparse Queries

The standard aggregate query uses a *dense* representation of the resulting
data space. What this means is that all dimensions are realized, even if the
resulting aggregate values are zero. So if you group by columns A and B,
and column A has 3 unique values and column B has 4 unique values, then
the resulting aggregate table will have 3*4=12 rows, including zero values.

Datavore also supports a *sparse* representation that does not include rows
for zero values. To use a sparse representation, use the `sparse_query`
function, like so:

    // non-zero counts of all table rows where first column != "a"
    // returns -> [["b","c"], [2,1]]
    var sparse = tab1.sparse_query({dims:[0], vals:[dv.count()], where:
        function(table, row) { return table.get("A",row) != "a"; }
    });

So why the different query types? Dense queries can be calculated faster
&ndash; by "materializing" the full dimensionality of the aggregated data one
can use an array to store all the intermediate results. The sparse
representation instead uses an associative array (a JavaScript object
instance), which induces a higher overhead for object value lookups. On the
other hand, dense queries over high-dimensional data can produce very large
result arrays; sometimes these can be too large to fit in the browser's memory
footprint. So, if you are dealing with high-dimensional aggregates (concretely,
if the product of the set sizes of your group-by dimensions is > 100,000 rows)
you should consider using `sparse_query`. However, if the total number of
aggregate rows is reasonable (as is typically the case), or you want to
explicitly include zero-valued cells, use the normal `query` method for faster
performance.

*NOTE:* Dense queries are processed by the `dense_query` function. The
`query` function is simply an alias for `dense_query`.

### Extensibility

Datavore can be extended with new dimensional and (with some effort)
aggregate operators. To create your own dimensional operator, view the source
code for `dv.bin` and `dv.quantile`, and follow their example. Adding new
aggregate operators is possible but more complex. You will need to add a new
module (following in the foot steps of `dv.sum`, `dv.avg`, etc) and add new
logic to the inner loop of the query processor (for both dense and sparse
queries). *This is not for the faint of heart!* The query processor avoids
making function calls within its inner loop &mdash; this helps make Datavore
much faster, but at some cost to extensibility. You will have to modify the
guts of the engine to add new aggregate operators.