# Projection Trend Explorer

Projection Trend Explorer is a browser-based interactive for viewing yearly trends in outcomes for older Californians, using weighted means from the projection dataset.

Users can:

- Choose one or more comparisons
- Select an outcome for each comparison
- Subset by race/ethnicity, gender, age group, and education
- Switch the denominator between all adults and the labor force when that option exists for the selected outcome
- View separate lines for historical data (`pred=FALSE`) and projections (`pred=TRUE`)
- Download the displayed results as a CSV

## Data

The interactive reads:

- `data/projections_age5cat_2006_2040.csv`

The app collapses rows to the selected demographic group and year using `totpop` as the weight.

Some outcomes are suppressed when the selected group's total population falls below 20,000 in any year in the data.

The poverty and near-poverty measures are:

- `Poverty*`
- `Near poverty*`

`* Based on PPIC's version of the supplemental poverty measure. Takes into account taxes, safety net programs, and local cost of living. Available in historical data for 2011-2019 and 2021-2024.`

## Files

- `index.html` sets up the page structure
- `styles.css` controls the visual layout and styling
- `app.js` loads the CSV, builds the filters, calculates weighted means, and renders the chart and table

## Run Locally

From this folder, start a simple local server:

```bash
cd "/Users/ericmcghee/Documents/New project"
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/`

## Publish To GitHub Pages

Upload these files to the GitHub repository that is serving the site:

- `index.html`
- `styles.css`
- `app.js`
- `data/projections_age5cat_2006_2040.csv`
- `README.md`

If GitHub Pages is set to publish from the repository root, those files should live in the top level of the repo, with the CSV inside the `data/` folder.
