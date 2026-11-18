"use strict";

(function () {
    var form = document.getElementById("loan-form");
    var currencySelect = document.getElementById("cur");
    var currencySymbol = document.getElementById("currency-symbol");
    var errorMessage = document.getElementById("form-error");
    var downloadButton = document.getElementById("download-schedule");
    var rows = document.getElementById("rows");
    var locale = navigator.language || "en-US";
    var hasInteracted = false;
    var defaultCurrency = "USD";

    function setupCurrencies() {
        var supportedCurrencies = typeof Intl.supportedValuesOf === "function"
            ? Intl.supportedValuesOf("currency")
            : ["AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "INR", "JPY", "NZD", "USD"];
        var displayNames = typeof Intl.DisplayNames === "function"
            ? new Intl.DisplayNames([locale], { type: "currency" })
            : null;

        supportedCurrencies.forEach(function (code) {
            var option = document.createElement("option");
            option.value = code;
            option.textContent = displayNames
                ? code + " — " + displayNames.of(code)
                : code;
            currencySelect.appendChild(option);
        });

        currencySelect.value = defaultCurrency;
    }

    function parseDate(value) {
        var parts = value.split("-").map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function addMonths(date, months) {
        var monthIndex = date.getMonth() + months;
        var year = date.getFullYear() + Math.floor(monthIndex / 12);
        var month = ((monthIndex % 12) + 12) % 12;
        var day = Math.min(date.getDate(), new Date(year, month + 1, 0).getDate());
        return new Date(year, month, day);
    }

    function getCurrencyFormatter() {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currencySelect.value
        });
    }

    function getDateFormatter() {
        return new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function setSummary(values) {
        document.getElementById("pmt").textContent = values.payment;
        document.getElementById("n").textContent = values.count;
        document.getElementById("principal-summary").textContent = values.principal;
        document.getElementById("tint").textContent = values.interest;
        document.getElementById("tcost").textContent = values.total;
    }

    function renderEmptySchedule(message) {
        var cell = document.createElement("td");
        cell.className = "empty-state";
        cell.colSpan = 7;
        cell.textContent = message;

        var row = document.createElement("tr");
        row.appendChild(cell);
        rows.textContent = "";
        rows.appendChild(row);
    }

    function showInvalid(message) {
        errorMessage.textContent = message;
        errorMessage.hidden = !hasInteracted;
        downloadButton.disabled = true;
        setSummary({
            payment: "—",
            count: "—",
            principal: "—",
            interest: "—",
            total: "—"
        });
        document.getElementById("schedule-count").textContent = "";
        renderEmptySchedule("Correct the loan details above to see your payment schedule.");
    }

    function calculate() {
        var amountField = document.getElementById("amt");
        var rateField = document.getElementById("rate");
        var yearsField = document.getElementById("yrs");
        var startField = document.getElementById("start");
        var principal = Number(amountField.value);
        var annualRate = Number(rateField.value);
        var years = Number(yearsField.value);
        var paymentCount = years * 12;

        currencySymbol.textContent = new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currencySelect.value,
            maximumFractionDigits: 0
        }).formatToParts(0).find(function (part) {
            return part.type === "currency";
        }).value;

        if (!amountField.value || !Number.isFinite(principal) || principal <= 0 ||
            !rateField.value || !Number.isFinite(annualRate) || annualRate < 0 ||
            annualRate > 100 || !yearsField.value || !Number.isInteger(years) ||
            years < 1 || years > 50 || !startField.value) {
            showInvalid("Enter a loan amount above zero, an interest rate from 0% to 100%, a whole-number term from 1 to 50 years, and a first payment date.");
            return;
        }

        errorMessage.hidden = true;
        var formatter = getCurrencyFormatter();
        var dateFormatter = getDateFormatter();
        var currencyScale = Math.pow(10, formatter.resolvedOptions().maximumFractionDigits);
        function roundCurrency(value) {
            return Math.round((value + Number.EPSILON) * currencyScale) / currencyScale;
        }

        principal = roundCurrency(principal);
        if (principal <= 0) {
            showInvalid("Enter a loan amount of at least one unit of the selected currency.");
            return;
        }
        var monthlyRate = annualRate / 100 / 12;
        var unroundedPayment = monthlyRate === 0
            ? principal / paymentCount
            : principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -paymentCount));
        if (!Number.isFinite(unroundedPayment) ||
            !Number.isFinite(unroundedPayment * paymentCount)) {
            showInvalid("This loan amount is too large to calculate safely. Try a smaller amount.");
            return;
        }
        var regularPayment = Math.max(
            1 / currencyScale,
            Math.ceil(unroundedPayment * currencyScale - Number.EPSILON) / currencyScale
        );
        var balance = principal;
        var totalPaid = 0;
        var totalInterest = 0;
        var paymentDateStart = parseDate(startField.value);
        var scheduleRows = document.createDocumentFragment();
        var actualPaymentCount = 0;
        var csvRows = [[
            "Payment number",
            "Payment date",
            "Starting balance",
            "Payment",
            "Principal",
            "Interest",
            "Remaining balance"
        ]];

        for (var index = 1; index <= paymentCount; index += 1) {
            var beginningBalance = balance;
            var interest = roundCurrency(beginningBalance * monthlyRate);
            var principalPaid = Math.min(regularPayment - interest, beginningBalance);

            if (index === paymentCount) {
                principalPaid = beginningBalance;
            }

            principalPaid = roundCurrency(principalPaid);
            var payment = roundCurrency(principalPaid + interest);
            balance = Math.max(0, roundCurrency(beginningBalance - principalPaid));
            totalPaid += payment;
            totalInterest += interest;
            actualPaymentCount = index;
            var paymentDate = dateFormatter.format(addMonths(paymentDateStart, index));
            var formattedValues = [
                String(index),
                paymentDate,
                formatter.format(beginningBalance),
                formatter.format(payment),
                formatter.format(principalPaid),
                formatter.format(interest),
                formatter.format(balance)
            ];

            var scheduleRow = document.createElement("tr");
            formattedValues.forEach(function (value) {
                var cell = document.createElement("td");
                cell.textContent = value;
                scheduleRow.appendChild(cell);
            });
            scheduleRows.appendChild(scheduleRow);
            csvRows.push(formattedValues);
            if (balance === 0) {
                break;
            }
        }

        setSummary({
            payment: formatter.format(regularPayment),
            count: actualPaymentCount.toLocaleString(locale),
            principal: formatter.format(principal),
            interest: formatter.format(roundCurrency(totalInterest)),
            total: formatter.format(roundCurrency(totalPaid))
        });
        document.getElementById("schedule-count").textContent =
            actualPaymentCount.toLocaleString(locale) + " monthly payments";
        rows.textContent = "";
        rows.appendChild(scheduleRows);
        downloadButton.disabled = false;
        downloadButton.onclick = function () {
            downloadCsv(csvRows);
        };
    }

    function downloadCsv(data) {
        var csv = data.map(function (row) {
            return row.map(function (value) {
                return '"' + value.replace(/"/g, '""') + '"';
            }).join(",");
        }).join("\r\n");
        var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "loan-payment-schedule.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 0);
    }

    function setDefaultDate() {
        var today = new Date();
        document.getElementById("start").value = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0")
        ].join("-");
    }

    setupCurrencies();
    setDefaultDate();
    renderEmptySchedule("Enter valid loan details to see your payment schedule.");
    form.addEventListener("input", function () {
        hasInteracted = true;
        calculate();
    });
    form.addEventListener("change", function () {
        hasInteracted = true;
        calculate();
    });
    form.addEventListener("reset", function () {
        window.setTimeout(function () {
            hasInteracted = false;
            currencySelect.value = defaultCurrency;
            setDefaultDate();
            calculate();
        }, 0);
    });
    form.addEventListener("submit", function (event) {
        event.preventDefault();
    });
    calculate();
}());
