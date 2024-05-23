const axios = require('axios');
const qs = require('query-string');
const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const moment = require('moment');
const csv = require('csv-parser');

const errorHandler = require('../../utils/errorHandler');
// const { ZOOM_API_BASE_URL } = require('../../constants');

const ZOOM_API_BASE_URL = 'https://api.zoom.us/v2';

const downloadJsonDir = '/app/downloads'; // Directory for downloads JSON files
const savedCsvDir = '/app/savedCsv'; // Directory for save CSV files
const processedCsvDir = '/app/csvProcessed'; // Directory for processed CSVs

// Directory for send email
const { sendEmailWithDetails } = require('../../utils/emailService');


// Utility function to read CSV file
function readCsvFile(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv({
                mapHeaders: ({ header }) => header.toLowerCase().trim()
            }))
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// Function to process Zoom participation from a CSV file
async function processZoomParticipation(file_path, output_directory) {
    const rows = await readCsvFile(file_path);
    const joinLateCutoff = 10; // minutes after meeting start to consider as late
    const participationCutoff = 90; // percent of the meeting duration to be considered as present

    // Assuming the first participant's join time is the start of the meeting
    const firstJoinTime = moment(rows[0]['join_time'], moment.ISO_8601);

    let processedResults = rows.map(row => {
        const joinTime = moment(row['join_time'], moment.ISO_8601);
        const leaveTime = moment(row['leave_time'], moment.ISO_8601);
        const durationMinutes = Math.round(moment.duration(leaveTime.diff(joinTime)).asMinutes());
        const joinLateMinutes = Math.round(moment.duration(joinTime.diff(firstJoinTime)).asMinutes());

        // Determine if the participant was late and if they participated enough
        const wasLate = joinLateMinutes > joinLateCutoff;
        const didParticipateEnough = durationMinutes >= participationCutoff;
        const status = (!wasLate && didParticipateEnough) ? 'Present' : 'Absent';

        return {
            ...row,
            'Status': status
        };
    });

    // Convert processed results to CSV
    const processedFilePath = path.join(output_directory, `processed_${path.basename(file_path)}`);
    const fields = ['id', 'name', 'user_email', 'join_time', 'leave_time', 'duration', 'Status'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(processedResults);

    fs.writeFileSync(processedFilePath, csv, 'utf8');
    console.log(`Processed file saved to ${processedFilePath}`);

    return processedFilePath; // Ensure the processed file path is returned
}


async function handleMeetingParticipantsReport(meetingId, accessToken, meetingDetails) {
    console.log("Received meeting details:", meetingDetails);

    // Construct the header configuration with the provided access token
    const headerConfig = {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    };

    try {
        console.log(`Fetching participants report for meeting ID: ${meetingId}`);

        // Fetch participants from Zoom API
        const request = await axios.get(`${ZOOM_API_BASE_URL}/report/meetings/${meetingId}/participants`, headerConfig);

        // Directories setup
        const jsonFilePath = path.join(downloadJsonDir, `${meetingId}_participants.json`);
        const csvFilePath = path.join(savedCsvDir, `${meetingId}_participants.csv`);

        // Write JSON response to file
        fs.writeFileSync(jsonFilePath, JSON.stringify(request.data, null, 2), 'utf8');
        console.log(`JSON data saved to ${jsonFilePath}`);

        // Process participants data for CSV conversion
        const participants = request.data.participants.map(participant => {
            return {
                ...participant,
                duration: Math.round(participant.duration / 60) // Convert seconds to minutes
            };
        });

        // Define fields for CSV, ensuring they match the participant object keys
        const fields = ['id', 'name', 'user_email', 'join_time', 'leave_time', 'duration'];
        const json2csvParser = new Parser({ fields });
        const csvData = json2csvParser.parse(participants);

        // Write the CSV file
        fs.writeFileSync(csvFilePath, csvData, 'utf8');
        console.log(`CSV data saved to ${csvFilePath}`);

        // Process the participation data and calculate the attendance status
        console.log("Calling processZoomParticipation...");
        const filePath = await processZoomParticipation(csvFilePath, processedCsvDir);
        console.log(`processZoomParticipation returned: ${filePath}`);

        // Pass meeting details along with CSV file path to the email service
        if (filePath) {
            sendEmailWithDetails(filePath, meetingDetails);
        } else {
            console.error("Processed file path is undefined.");
        }
    } catch (error) {
        console.error(`Error fetching participants report: ${error.response ? error.response.data : error.message}`);
        errorHandler(error, null, `Failed to fetch participants for meeting: ${meetingId}`);
    }
}

module.exports = handleMeetingParticipantsReport;