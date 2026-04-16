const DATA_URL = "./data/projections_age5cat_2020_2040.csv";
const SUPPRESSION_THRESHOLD = 200;

const OUTCOME_OPTIONS = [
  { key: "poor", label: "Poor" },
  { key: "lfp", label: "Labor force participant" },
  { key: "full_time", label: "Full time worker" },
  { key: "live_any_fam", label: "Lives with any family member" },
  { key: "live_spouse", label: "Lives with spouse" },
  { key: "live_fam_lf", label: "Lives with any family member AND in the labor force" },
  { key: "live_sp_lf", label: "Lives with spouse AND in the labor force" },
  { key: "poor_lf", label: "Poor AND in the labor force" },
  { key: "own", label: "Homeowner" },
  { key: "stress30", label: "Housing > 30% of income" },
  { key: "stress50", label: "Housing > 50% of income" },
];

const OUTCOME_LABELS = Object.fromEntries(OUTCOME_OPTIONS.map((option) => [option.key, option.label]));
const FILTER_CONFIG = [
  {
    key: "race_ethnicity",
    label: "Race/Ethnicity",
    values: ["Latino", "White", "Black", "Asian", "Pacific Islander", "Other/None Listed"],
  },
  { key: "gender", label: "Gender", values: ["Female", "Male"] },
  {
    key: "age_cat",
    label: "Age Group",
    values: ["55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85-89", "90+"],
  },
  {
    key: "education",
    label: "Education",
    values: ["No HS Degree", "HS Graduate", "Some College", "College Graduate"],
  },
];
const REQUIRED_DATA_COLUMNS = [
  "year",
  "totpop",
  "latino",
  "white",
  "black",
  "asian",
  "pacis",
  "female",
  "age_cat",
  "ed_hsgrad",
  "ed_somecoll",
  "ed_collgrad",
  ...OUTCOME_OPTIONS.map((option) => option.key),
];
const SERIES_COLORS = ["#d27c2c", "#0d6c63", "#9c3d54", "#3568b0", "#5f5a9d", "#7d6a1f"];

const state = {
  rows: [],
  series: [],
  comparisons: [],
  nextComparisonId: 1,
};

const comparisonList = document.querySelector("#comparison-list");
const addComparisonButton = document.querySelector("#add-comparison-button");
const selectionSummary = document.querySelector("#selection-summary");
const yearCount = document.querySelector("#year-count");
const resultsHead = document.querySelector("#results-head");
const resultsBody = document.querySelector("#results-body");
const chart = document.querySelector("#chart");
const downloadButton = document.querySelector("#download-button");

init().catch((error) => {
  console.error(error);
  selectionSummary.textContent = "Unable to load the projection dataset.";
  chart.innerHTML = '<div class="chart-empty">Failed to load data.</div>';
});

async function init() {
  state.comparisons = [createComparison()];
  renderComparisonControls();

  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status}`);
  }

  const text = await response.text();
  state.rows = parseCsv(text);

  addComparisonButton.addEventListener("click", addComparison);
  downloadButton.addEventListener("click", downloadSeries);

  updateView();
}

function createComparison() {
  const comparison = {
    id: state.nextComparisonId,
    outcome: "stress50",
    race_ethnicity: "",
    gender: "",
    age_cat: "",
    education: "",
  };

  state.nextComparisonId += 1;
  return comparison;
}

function renderComparisonControls() {
  comparisonList.innerHTML = state.comparisons
    .map(
      (comparison, index) => `
        <section class="comparison-card" data-comparison-id="${comparison.id}">
          <div class="comparison-card-header">
            <div>
              <h3>Comparison ${index + 1}</h3>
              <p>${buildComparisonLabel(comparison)}</p>
            </div>
            ${
              state.comparisons.length > 1
                ? `<button class="button ghost remove-comparison-button" type="button" data-remove-id="${comparison.id}" aria-label="Remove comparison ${index + 1}">Remove</button>`
                : ""
            }
          </div>
          <div class="comparison-grid">
            ${renderSelectControl(comparison.id, "outcome", "Outcome", OUTCOME_OPTIONS, comparison.outcome, false)}
            ${FILTER_CONFIG.map((filter) =>
              renderSelectControl(comparison.id, filter.key, filter.label, filter.values, comparison[filter.key], true),
            ).join("")}
          </div>
        </section>
      `,
    )
    .join("");

  comparisonList.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", handleComparisonChange);
  });

  comparisonList.querySelectorAll(".remove-comparison-button").forEach((button) => {
    button.addEventListener("click", removeComparison);
  });
}

function renderSelectControl(comparisonId, key, label, options, selectedValue, includeAllOption) {
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { key: option, label: option } : option,
  );

  return `
    <label class="control">
      <span>${label}</span>
      <select data-comparison-id="${comparisonId}" data-field="${key}">
        ${includeAllOption ? '<option value="">All</option>' : ""}
        ${normalizedOptions
          .map(
            (option) =>
              `<option value="${option.key}" ${option.key === selectedValue ? "selected" : ""}>${option.label}</option>`,
          )
          .join("")}
      </select>
    </label>
  `;
}

function addComparison() {
  state.comparisons.push(createComparison());
  renderComparisonControls();
  updateView();
}

function removeComparison(event) {
  const comparisonId = Number(event.currentTarget.dataset.removeId);
  state.comparisons = state.comparisons.filter((comparison) => comparison.id !== comparisonId);
  renderComparisonControls();
  updateView();
}

function handleComparisonChange(event) {
  const comparisonId = Number(event.currentTarget.dataset.comparisonId);
  const field = event.currentTarget.dataset.field;
  const comparison = state.comparisons.find((entry) => entry.id === comparisonId);
  comparison[field] = event.currentTarget.value;
  renderComparisonControls();
  updateView();
}

function parseCsv(text) {
  const records = parseCsvRecords(text);
  if (records.length < 2) {
    throw new Error("Dataset is empty.");
  }

  const headers = records[0].map((value) => stripQuotes(value));
  REQUIRED_DATA_COLUMNS.forEach((header) => {
    if (!headers.includes(header)) {
      throw new Error(`Dataset is missing required column: ${header}`);
    }
  });

  const rows = records.slice(1).map((values) => {
    const row = {};

    headers.forEach((header, index) => {
      row[header] = stripQuotes(values[index] ?? "");
    });

    row.year = Number(row.year);
    row.totpop = Number(row.totpop);

    OUTCOME_OPTIONS.forEach(({ key }) => {
      row[key] = Number(row[key]);
    });

    return row;
  });

  const validRows = rows.filter((row) => Number.isFinite(row.year) && Number.isFinite(row.totpop));
  if (validRows.length === 0) {
    throw new Error("Dataset rows could not be parsed.");
  }

  return validRows;
}

function updateView() {
  state.series = buildSeries(state.comparisons);
  renderSummary();
  renderTable();
  renderChart();
}

function buildSeries(comparisons) {
  return comparisons.map((comparison, index) => {
    const filteredRows = state.rows.filter((row) => comparisonMatchesRow(comparison, row));
    const grouped = new Map();

    filteredRows.forEach((row) => {
      const current = grouped.get(row.year) || { totalPopulation: 0, weightedSum: 0 };
      current.totalPopulation += row.totpop;
      current.weightedSum += row[comparison.outcome] * row.totpop;
      grouped.set(row.year, current);
    });

    const points = [...grouped.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([year, values]) => ({
        year,
        totalPopulation: values.totalPopulation,
        suppressed: values.totalPopulation < SUPPRESSION_THRESHOLD,
        value:
          values.totalPopulation >= SUPPRESSION_THRESHOLD
            ? values.weightedSum / values.totalPopulation
            : null,
      }));

    return {
      ...comparison,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      label: buildComparisonLabel(comparison),
      matchedRows: filteredRows.length,
      points,
    };
  });
}

function comparisonMatchesRow(comparison, row) {
  return FILTER_CONFIG.every((filter) => {
    if (!comparison[filter.key]) {
      return true;
    }
    return matchesFilter(row, filter.key, comparison[filter.key]);
  });
}

function renderSummary() {
  const comparisonText = state.series.map((series) => series.label).join(" | ");
  const years = new Set(state.series.flatMap((series) => series.points.map((point) => point.year)));
  selectionSummary.textContent = `${comparisonText}. Each line is collapsed by year using total population as weights. Cells with total population below ${SUPPRESSION_THRESHOLD} are suppressed.`;
  yearCount.textContent = String(years.size);
}

function renderTable() {
  const years = getAllYears();
  resultsHead.innerHTML = `
    <tr>
      <th>Year</th>
      ${state.series.map((series) => `<th>${escapeHtml(series.label)}</th>`).join("")}
    </tr>
  `;

  if (years.length === 0) {
    resultsBody.innerHTML = `<tr><td colspan="${state.series.length + 1}">No rows match the current comparison selections.</td></tr>`;
    return;
  }

  resultsBody.innerHTML = years
    .map((year) => {
      const cells = state.series
        .map((series) => {
          const point = series.points.find((entry) => entry.year === year);
          if (!point) {
            return "<td>No data</td>";
          }
          if (point.suppressed) {
            return "<td>Suppressed</td>";
          }
          return `<td>${formatRate(point.value)}<br><span class="cell-meta">Total population: ${formatPopulation(point.totalPopulation)}</span></td>`;
        })
        .join("");

      return `<tr><td>${year}</td>${cells}</tr>`;
    })
    .join("");
}

function renderChart() {
  const visibleValues = state.series.flatMap((series) =>
    series.points.flatMap((point) => (point.suppressed || point.value === null ? [] : [point.value])),
  );

  if (visibleValues.length === 0) {
    chart.innerHTML =
      '<div class="chart-empty">No visible chart values are available for the current comparison selections.</div>';
    return;
  }

  const years = getAllYears();
  const width = 760;
  const height = 360;
  const margin = { top: 24, right: 24, bottom: 44, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const minYear = years[0];
  const maxYear = years[years.length - 1];
  const minValue = Math.min(...visibleValues);
  const maxValue = Math.max(...visibleValues);
  const paddedMin = Math.max(0, minValue - 0.03);
  const paddedMax = Math.min(1, maxValue + 0.03);
  const yTicks = buildTicks(paddedMin, paddedMax, 5);

  const xPosition = (year) => {
    if (maxYear === minYear) {
      return margin.left + plotWidth / 2;
    }
    return margin.left + ((year - minYear) / (maxYear - minYear)) * plotWidth;
  };

  const yPosition = (value) => {
    if (paddedMax === paddedMin) {
      return margin.top + plotHeight / 2;
    }
    return margin.top + plotHeight - ((value - paddedMin) / (paddedMax - paddedMin)) * plotHeight;
  };

  const yearTicks = years.filter((_, index) => {
    if (years.length <= 6) {
      return true;
    }
    return index === 0 || index === years.length - 1 || index % 4 === 0;
  });

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Outcome comparison chart">
      ${yTicks
        .map(
          (tick) => `
            <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${yPosition(
              tick,
            )}" y2="${yPosition(tick)}"></line>
            <text class="tick-label" x="${margin.left - 10}" y="${yPosition(tick) + 4}" text-anchor="end">${formatRate(
              tick,
            )}</text>
          `,
        )
        .join("")}
      <line class="axis" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${height - margin.bottom}"></line>
      <line class="axis" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"></line>
      ${state.series.map((series) => renderSeriesPath(series, xPosition, yPosition)).join("")}
      ${state.series.map((series) => renderSeriesPoints(series, xPosition, yPosition)).join("")}
      ${yearTicks
        .map(
          (year) => `
            <text class="tick-label" x="${xPosition(year)}" y="${height - margin.bottom + 20}" text-anchor="middle">${year}</text>
          `,
        )
        .join("")}
      <text class="axis-label" x="${width / 2}" y="${height - 6}" text-anchor="middle">Year</text>
      <text class="axis-label" x="16" y="${height / 2}" text-anchor="middle" transform="rotate(-90 16 ${height / 2})">Weighted Mean</text>
    </svg>
    <div class="legend">
      ${state.series
        .map(
          (series) => `
            <span class="legend-item">
              <span class="legend-swatch" style="background:${series.color}"></span>
              <span>${escapeHtml(series.label)}</span>
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSeriesPath(series, xPosition, yPosition) {
  let started = false;
  const path = series.points
    .map((point) => {
      if (point.suppressed || point.value === null) {
        started = false;
        return "";
      }
      const command = started ? "L" : "M";
      started = true;
      return `${command} ${xPosition(point.year)} ${yPosition(point.value)}`;
    })
    .join(" ");

  return `<path class="series-line" d="${path}" stroke="${series.color}"></path>`;
}

function renderSeriesPoints(series, xPosition, yPosition) {
  return series.points
    .map((point) => {
      if (point.suppressed || point.value === null) {
        return "";
      }
      return `
        <g>
          <circle class="series-point" cx="${xPosition(point.year)}" cy="${yPosition(point.value)}" r="4" stroke="${series.color}"></circle>
          <title>${escapeHtml(series.label)} | ${point.year}: ${formatRate(point.value)} | Total population: ${formatPopulation(point.totalPopulation)}</title>
        </g>
      `;
    })
    .join("");
}

function getAllYears() {
  return [...new Set(state.series.flatMap((series) => series.points.map((point) => point.year)))].sort(
    (left, right) => left - right,
  );
}

function buildComparisonLabel(comparison) {
  const parts = [OUTCOME_LABELS[comparison.outcome]];
  FILTER_CONFIG.forEach((filter) => {
    if (comparison[filter.key]) {
      parts.push(`${filter.label}: ${comparison[filter.key]}`);
    }
  });
  return parts.join(" | ");
}

function buildTicks(min, max, count) {
  if (count <= 1 || min === max) {
    return [min];
  }

  const ticks = [];
  for (let index = 0; index < count; index += 1) {
    ticks.push(min + ((max - min) * index) / (count - 1));
  }
  return ticks;
}

function parseCsvRecords(text) {
  const records = [];
  let currentField = "";
  let currentRecord = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRecord.push(currentField);
      currentField = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRecord.push(currentField);
      if (currentRecord.some((value) => value !== "")) {
        records.push(currentRecord);
      }
      currentField = "";
      currentRecord = [];
      continue;
    }

    currentField += character;
  }

  if (currentField !== "" || currentRecord.length > 0) {
    currentRecord.push(currentField);
    if (currentRecord.some((value) => value !== "")) {
      records.push(currentRecord);
    }
  }

  return records;
}

function stripQuotes(value) {
  return value.replace(/^"(.*)"$/, "$1");
}

function downloadSeries() {
  if (state.series.length === 0) {
    return;
  }

  const years = getAllYears();
  const header = ["year"];
  state.series.forEach((series, index) => {
    header.push(`comparison_${index + 1}_label`);
    header.push(`comparison_${index + 1}_value`);
    header.push(`comparison_${index + 1}_total_population`);
    header.push(`comparison_${index + 1}_suppressed`);
  });

  const lines = [
    header.join(","),
    ...years.map((year) => {
      const row = [year];
      state.series.forEach((series) => {
        const point = series.points.find((entry) => entry.year === year);
        row.push(csvEscape(series.label));
        row.push(point && !point.suppressed ? point.value : point ? "Suppressed" : "No data");
        row.push(point ? point.totalPopulation : "");
        row.push(point ? (point.suppressed ? "TRUE" : "FALSE") : "");
      });
      return row.join(",");
    }),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "projection-comparisons.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function formatRate(value) {
  return Number(value).toFixed(3);
}

function formatPopulation(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function matchesFilter(row, key, value) {
  if (key === "race_ethnicity") {
    return getRaceEthnicity(row) === value;
  }
  if (key === "gender") {
    return getGender(row) === value;
  }
  if (key === "education") {
    return getEducation(row) === value;
  }
  return row[key] === value;
}

function getRaceEthnicity(row) {
  if (row.latino === "TRUE") {
    return "Latino";
  }
  if (row.white === "TRUE") {
    return "White";
  }
  if (row.black === "TRUE") {
    return "Black";
  }
  if (row.asian === "TRUE") {
    return "Asian";
  }
  if (row.pacis === "TRUE") {
    return "Pacific Islander";
  }
  return "Other/None Listed";
}

function getGender(row) {
  return row.female === "TRUE" ? "Female" : "Male";
}

function getEducation(row) {
  if (row.ed_collgrad === "TRUE") {
    return "College Graduate";
  }
  if (row.ed_somecoll === "TRUE") {
    return "Some College";
  }
  if (row.ed_hsgrad === "TRUE") {
    return "HS Graduate";
  }
  return "No HS Degree";
}

function csvEscape(value) {
  const stringValue = String(value);
  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
