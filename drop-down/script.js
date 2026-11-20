function showError(msg) {
  let el = document.getElementById('error');
  if (!msg) {
    el.style.display = 'none';
  } else {
    el.innerHTML = msg;
    el.style.display = 'block';
  }
}

function updateDropdown(records) {
  const dropdown = document.getElementById('dropdown');
  dropdown.innerHTML = '';
  if (records.length === 0) {
    const optionElement = document.createElement('option');
    optionElement.textContent = 'No options available';
    dropdown.appendChild(optionElement);
  } else {
    records.forEach((record) => {
      const optionElement = document.createElement('option');
      optionElement.value = String(record.id);
      optionElement.textContent = String(record.OptionsToSelect);
      dropdown.appendChild(optionElement);
    });
  }
}

function saveOption() {
  const sid = document.getElementById("sessionid").value;
  grist.widgetApi.setOption('sessionid', sid);
}

function initGrist() {
  let allRecords = [];
  let sessionID = "";
  const storageKey = () => sessionID + "_Dropdown_Item";

  grist.ready({
    columns: [{ name: "OptionsToSelect", title: 'Options to select', type: 'Any' }],
    requiredAccess: 'read table',
    allowSelectBy: true,
    onEditOptions() {
      document.getElementById("container").style.display = 'none';
      document.getElementById("config").style.display = '';
      document.getElementById("sessionid").value = sessionID;
    },
  });

  grist.onOptions((customOptions, _) => {
    customOptions = customOptions || {};
    sessionID = customOptions.sessionid || "";   

    document.getElementById("container").style.display = '';
    document.getElementById("config").style.display = 'none';
  });

  grist.onRecords(function (records, mappings) {
    if (!records || records.length === 0) {
      showError("No records received");
      updateDropdown([]);
      return;
    }
    
    allRecords = records;
    const mapped = grist.mapColumnNames(records) || [];

    showError("");
    const options = mapped.filter(record => record.OptionsToSelect !== null && record.OptionsToSelect !== undefined);
    
    if (options.length === 0) {
      showError("No valid options found");
    }
    updateDropdown(options);

    //if session ID defined, use it to auto select the stored record id
    if (sessionID.length > 0) {
      const selection = sessionStorage.getItem(storageKey());
      if (selection) {
        const dropdown = document.getElementById('dropdown');
        dropdown.value = selection;
        //notify only if the stored record id still matches an option
        if (dropdown.value === selection) {
          dropdown.dispatchEvent(new Event('change'));
        }
      }
    }    
  });

  grist.onRecord(function (record) {
    if (!record) {
      return;
    }
    const dropdown = document.getElementById('dropdown');
    //select the option matching the record id
    dropdown.value = String(record.id);
    //update sessionStorage when the stored record id is different
    if (sessionID.length > 0 && sessionStorage.getItem(storageKey()) !== String(record.id)) {
      sessionStorage.setItem(storageKey(), record.id);
    }
  });

  //update the dropdown when sessionStorage changes in another tab/window
  window.addEventListener('storage', function(event) {
    if (sessionID.length === 0 || event.storageArea !== sessionStorage) {
      return;
    }
    if (event.key !== storageKey() || !event.newValue) {
      return;
    }
    const dropdown = document.getElementById('dropdown');
    if (dropdown.value === event.newValue) {
      return;
    }
    dropdown.value = event.newValue;
    //notify only if the new record id matches an option
    if (dropdown.value === event.newValue) {
      dropdown.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('dropdown').addEventListener('change', function(event) {    
    const selectedId = Number(event.target.value);
    const selectedRecord = allRecords.find(record => record.id === selectedId);
    if (selectedRecord) {
      grist.setCursorPos({rowId: selectedRecord.id});
      //store the record id (not the table index) when it differs from the stored one
      if (sessionID.length > 0 && sessionStorage.getItem(storageKey()) !== String(selectedRecord.id)) {
        sessionStorage.setItem(storageKey(), selectedRecord.id);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', initGrist);