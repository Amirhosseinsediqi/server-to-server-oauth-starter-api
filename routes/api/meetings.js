const express = require('express');
const axios = require('axios');
const qs = require('query-string');
const path = require('path');
const fs = require('fs');
// const { Parser } = require('json2csv');



const errorHandler = require('../../utils/errorHandler');
const { ZOOM_API_BASE_URL } = require('../../constants');
const outputPath = path.join(__dirname, '../../downloads'); // Adjust the path as needed
const csvOutputPath = path.join(__dirname, '../../csvSaved'); // Adjust the path as neeeded for save csv files - output convertor json2csv

// Make sure the directory exists
if (!fs.existsSync(csvOutputPath)) {
    fs.mkdirSync(csvOutputPath, { recursive: true });
}

const router = express.Router();

/**
 * Get a meeting
 * https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/meeting
 */
router.get('/:meetingId', async (req, res) => {
    const { headerConfig, params } = req;
    const { meetingId } = params;

    try {
        const request = await axios.get(`${ZOOM_API_BASE_URL}/meetings/${meetingId}`, headerConfig);
        return res.json(request.data);
    } catch (err) {
        return errorHandler(err, res, `Error fetching meeting: ${meetingId}`);
    }
});

/**
 * Create a meeting
 * https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/meetingCreate
 */
router.post('/:userId', async (req, res) => {
    const { headerConfig, params, body } = req;
    const { userId } = params;

    try {
        const request = await axios.post(`${ZOOM_API_BASE_URL}/users/${userId}/meetings`, body, headerConfig);
        return res.json(request.data);
    } catch (err) {
        return errorHandler(err, res, `Error creating meeting for user: ${userId}`);
    }
});

/**
 * Update a meeting
 * https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/meetingUpdate
 */
router.patch('/:meetingId', async (req, res) => {
    const { headerConfig, params, body } = req;
    const { meetingId } = params;

    try {
        const request = await axios.patch(`${ZOOM_API_BASE_URL}/meetings/${meetingId}`, body, headerConfig);
        return res.json(request.data);
    } catch (err) {
        return errorHandler(err, res, `Error updating meeting: ${meetingId}`);
    }
});

/**
 * Delete a meeting
 * https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/meetingDelete
 */
router.delete('/:meetingId', async (req, res) => {
    const { headerConfig, params } = req;
    const { meetingId } = params;

    try {
        const request = await axios.delete(`${ZOOM_API_BASE_URL}/meetings/${meetingId}`, headerConfig);
        return res.json(request.data);
    } catch (err) {
        return errorHandler(err, res, `Error deleting meeting: ${meetingId}`);
    }
});






/**
 * Get meeting participant reports
 * https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/reportMeetingParticipants
 */
router.get('/:meetingId/report/participants', async (req, res) => {
    const { headerConfig, params, query } = req;
    const { meetingId } = params;
    const { next_page_token } = query;

    try {
        // code to get the data and save the JSON file
        const request = await axios.get(`${ZOOM_API_BASE_URL}/report/meetings/${meetingId}/participants?${qs.stringify({ next_page_token, })}`, headerConfig);
        const data = request.data;
        const filePath = path.join(outputPath, `${meetingId}_participants.json`);

        // save JSON file
        fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
            if (err) {
                console.error(`Failed to save the file: ${err}`);
                return res.status(500).send('Failed to download the JSON file.');
            }
            console.log(`File saved successfully to ${filePath}`);
            res.json(data); // Continue to send JSON response to the client
        });
    } catch (err) {
        return errorHandler(err, res, `Error fetching participants for meeting: ${meetingId}`);
    }
});



/**
 * Delete meeting recordings
 * https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/recordingDelete
 */
router.delete('/:meetingId/recordings', async (req, res) => {
    const { headerConfig, params, query } = req;
    const { meetingId } = params;
    const { action } = query;

    try {
        const request = await axios.delete(`${ZOOM_API_BASE_URL}/meetings/${meetingId}/recordings?${qs.stringify({ action })}`, headerConfig);
        return res.json(request.data);
    } catch (err) {
        return errorHandler(err, res, `Error deleting recordings for meeting: ${meetingId}`);
    }
});

module.exports = router;
