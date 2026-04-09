const DATA_URL = "./data/projections_age5cat_2020_2040.csv";

const OUTCOME_OPTIONS = [
  "poor",
  "lfp",
  "full_time",
  "live_any_fam",
  "live_spouse",
  "live_fam_lf",
  "live_sp_lf",
  "poor_lf",
  "own",
  "stress30",
  "stress50",
];

const FILTER_CONFIG = [
  {
    key: "race_ethnicity",
    label: "Race/Ethnicity",
    values: ["Latino", "White", "Black", "Asian", "Pacific Islander", "Other/None Listed"],
  },
  { key: "female", label: "Female", values: ["TRUE", "FALSE"] },
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
  ...OUTCOME_OPTIONS,
];

const state = {
  rows: [],
  series: [],
};

const outcomeSelect = document.querySelector("#outcome-select");
const selectionSummary = document.querySelector("#selection-summary");
const yearCount = document.querySelector("#year-count");
const resultsBody = document.querySelector("#results-body");
const chart = document.querySelector("#chart");
const downloadButton = document.querySelector("#download-button");

init().catch((error) => {
  console.error(error);
  selectionSummary.textContent = "Unable to load the projection dataset.";
  chart.innerHTML = '<div class="chart-empty">Failed to load data.</div>';
});

async function init() {
  populateControls();
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status}`);
  }
  const text = await response.text();
  state.rows = parseCsv(text);
  updateView();
}

function populateControls() {
  OUTCOME_OPTIONS.forEach((option) => {
    const element = document.createElement("option");
    element.value = option;
    element.textContent = prettifyLabel(option);
    if (option === "stress50") {
      element.selected = true;
    }
    outcomeSelect.appendChild(element);
  });

  FILTER_CONFIG.forEach((filter) => {
    const select = document.querySelector(`#filter-${filter.key}`);
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All";
    select.appendChild(allOption);

    filter.values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    select.addEventListener("change", updateView);
  });

  outcomeSelect.addEventListener("change", updateView);
  downloadButton.addEventListener("click", downloadSeries);
}

function parseCsv(text) {
  const records = parseCsvRecords(text);
  if (records.length < 2) {
    throw new Error("Dataset is empty.");
  }

  const headers = records[0].map((value) => stripQuotes(value));
  const requiredHeaders = REQUIRED_DATA_COLUMNS;

  requiredHeaders.forEach((header) => {
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

    OUTCOME_OPTIONS.forEach((key) => {
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
  const outcome = outcomeSelect.value;
  const activeFilters = getActiveFilters();
  const filteredRows = state.rows.filter((row) =>
    activeFilters.every((filter) => matchesFilter(row, filter)),
  );

  state.series = buildSeries(filteredRows, outcome);
  renderSummary(outcome, activeFilters, filteredRows.length);
  renderTable(state.series);
  renderChart(state.series, outcome);
}

function getActiveFilters() {
  return FILTER_CONFIG.map((filter) => ({
    ...filter,
    value: document.querySelector(`#filter-${filter.key}`).value,
  })).filter((filter) => filter.value !== "");
}

function buildSeries(rows, outcome) {
  const grouped = new Map();

  rows.forEach((row) => {
    const current = grouped.get(row.year) || { weightedSum: 0, totalWeight: 0, matchedRows: 0 };
    current.weightedSum += row[outcome] * row.totpop;
    current.totalWeight += row.totpop;
    current.matchedRows += 1;
    grouped.set(row.year, current);
  });

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([year, values]) => ({
      year,
      value: values.totalWeight > 0 ? values.weightedSum / values.totalWeight : null,
      totalWeight: values.totalWeight,
      matchedRows: values.matchedRows,
    }));
}

function renderSummary(outcome, activeFilters, filteredCount) {
  const filterText =
    activeFilters.length === 0
      ? "all rows"
      : activeFilters.map((filter) => `${filter.label} = ${filter.value}`).join("; ");

  selectionSummary.textContent = `${prettifyLabel(outcome)} trend for ${filterText}. Collapsed ${filteredCount.toLocaleString()} matched rows into ${state.series.length.toLocaleString()} yearly estimates using year and totpop.`;
  yearCount.textContent = String(state.series.length);
}

function renderTable(series) {
  if (series.length === 0) {
    resultsBody.innerHTML =
      '<tr><td colspan="4">No rows match the current filter selection.</td></tr>';
    return;
  }

  resultsBody.innerHTML = series
    .map(
      (point) => `
        <tr>
          <td>${point.year}</td>
          <td>${formatRate(point.value)}</td>
          <td>${formatWeight(point.totalWeight)}</td>
          <td>${point.matchedRows}</td>
        </tr>
      `,
    )
    .join("");
}

function renderChart(series, outcome) {
  if (series.length === 0) {
    chart.innerHTML = '<div class="chart-empty">No data for the selected subgroup combination.</div>';
    return;
  }

  const width = 760;
  const height = 360;
  const margin = { top: 24, right: 24, bottom: 44, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const minYear = series[0].year;
  const maxYear = series[series.length - 1].year;
  const values = series.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
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

  const path = series
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xPosition(point.year)} ${yPosition(point.value)}`)
    .join(" ");

  const yearTicks = series.filter((_, index) => {
    if (series.length <= 6) {
      return true;
    }
    return index === 0 || index === series.length - 1 || index % 4 === 0;
  });

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${prettifyLabel(outcome)} trend chart">
      ${yTicks
        .map(
          (tick) => `
            <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${yPosition(
              tick,
            )}" y2="${yPosition(tick)}"></line>
            <text class="tick-label" x="${margin.left - 10}" y="${yPosition(tick) + 4}" text-anchor="end">
              ${formatRate(tick)}
            </text>
          `,
        )
        .join("")}
      <line class="axis" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${height - margin.bottom}"></line>
      <line class="axis" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"></line>
      <path class="series-line" d="${path}"></path>
      ${series
        .map(
          (point) => `
            <g>
              <circle class="series-point" cx="${xPosition(point.year)}" cy="${yPosition(point.value)}" r="4"></circle>
              <title>${point.year}: ${formatRate(point.value)}</title>
            </g>
          `,
        )
        .join("")}
      ${yearTicks
        .map(
          (tick) => `
            <text class="tick-label" x="${xPosition(tick.year)}" y="${height - margin.bottom + 20}" text-anchor="middle">
              ${tick.year}
            </text>
          `,
        )
        .join("")}
      <text class="axis-label" x="${width / 2}" y="${height - 6}" text-anchor="middle">Year</text>
      <text class="axis-label" x="16" y="${height / 2}" text-anchor="middle" transform="rotate(-90 16 ${height / 2})">
        ${prettifyLabel(outcome)}
      </text>
    </svg>
  `;
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

  const outcome = outcomeSelect.value;
  const activeFilters = getActiveFilters();
  const filterValues = Object.fromEntries(FILTER_CONFIG.map((filter) => [filter.key, "All"]));
  activeFilters.forEach((filter) => {
    filterValues[filter.key] = filter.value;
  });

  const lines = [
    [
      "year",
      "outcome",
      "weighted_mean",
      "total_weight",
      "matched_rows",
      ...FILTER_CONFIG.map((filter) => filter.key),
    ].join(","),
    ...state.series.map((point) =>
      [
        point.year,
        outcome,
        point.value,
        point.totalWeight,
        point.matchedRows,
        ...FILTER_CONFIG.map((filter) => filterValues[filter.key]),
      ].join(","),
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${outcome}-trend.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function prettifyLabel(value) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchesFilter(row, filter) {
  if (filter.key === "race_ethnicity") {
    return getRaceEthnicity(row) === filter.value;
  }

  if (filter.key === "education") {
    return getEducation(row) === filter.value;
  }

  return row[filter.key] === filter.value;
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

function formatRate(value) {
  return Number(value).toFixed(3);
}

function formatWeight(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}
