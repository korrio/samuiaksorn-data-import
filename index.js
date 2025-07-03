import axios from 'axios';
import Papa from 'papaparse';
import _ from 'lodash';
import fs from 'fs/promises';
import path from 'path';

// Odoo connection configuration
const ODOO_CONFIG = {
    baseURL: 'https://erpsamuiaksorn.com',  // Replace with your Odoo server URL
    db: 'me16',               // Replace with your database name
    username: 'samuiaksorn@gmail.com',         // Replace with your username
    password: 'samuiaksorn',         // Replace with your password
};

// Function to authenticate and get session ID
async function authenticate() {
    try {
        const response = await axios.post(`${ODOO_CONFIG.baseURL}/web/session/authenticate`, {
            jsonrpc: '2.0',
            params: {
                db: ODOO_CONFIG.db,
                login: ODOO_CONFIG.username,
                password: ODOO_CONFIG.password
            }
        });
        
        return response.data.result.session_id;
    } catch (error) {
        console.error('Authentication failed:', error.message);
        throw error;
    }
}

// Function to create a lead in Odoo
async function createLead(sessionId, leadData) {
    try {
    	const theData = {
                jsonrpc: "2.0",
                params: {
                    model: "crm.lead",
                    method: "create",
                    args: [leadData],
                    "kwargs": {
                      "context": {
                        "lang": "en_US",
                        "tz": "Asia/Bangkok",
                        "uid": 2,
                        "allowed_company_ids": [
                          1
                        ],
                        "default_stage_id": 9,
                        "default_type": "opportunity",
                        "default_team_id": 1
                      }
                    }
                }
            };

         // console.log("theData", theData);
        const response = await axios.post(
            `${ODOO_CONFIG.baseURL}/web/dataset/call_kw`,
            theData
            ,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': `session_id=${sessionId}`
                }
            }
        );

        console.log("createLeadResp",response.data)
        return response.data;
    } catch (error) {
        console.error('Failed to create lead:', error.message);
        throw error;
    }
}

// Function to transform CSV data to Odoo lead format
function transformToLead(csvRow) {
    // Calculate expected revenue from AMOUNT
    const expectedRevenue = parseFloat(csvRow.AMOUNT) || 0;
    const job = csvRow['JOB.'].toString().padStart(5, '0');
    
    // Map job description and details
    const description = `
<table style="width: 100%; border-collapse: collapse;">
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>วันที่เสร็จ:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow['วันที่เสร็จ']}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>Job No:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${job}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>ลูกค้า:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow['HOTEL/FIRM']}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>CODE:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow.CODE}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>กระดาษ:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow.PAPER}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>สี:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow.COLOR}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>งานหลังพิมพ์:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow['งานหลังพิมพ์']}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>ช่างอาร์ต:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow['ช่างอาร์ต']}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>เครื่องพิมพ์:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow['เครื่องพิมพ์']}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>ช่างพิมพ์:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow['ช่างพิมพ์']}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>ราคาต่อหน่วย:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow.PRICE}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>จำนวนพิมพ์:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${csvRow.QTY}</td>
    </tr>
    <tr>
        <td style="padding: 4px; border: 1px solid #ddd;"><strong>ราคา:</strong></td>
        <td style="padding: 4px; border: 1px solid #ddd;">${expectedRevenue}</td>
    </tr>
</table>
    `;

    // Determine lead type based on CODE
    const type = true ? 'opportunity' : 'lead';

    // Parse date
    const dateStr = csvRow.DATE;
    const [day, month, year] = dateStr.split('/');
    const date = new Date(year, month - 1, day);
    const jobNo = csvRow['JOB.'].toString().padStart(5, '0');

    // Parse date_closed from วันที่เสร็จ field (format: DD-MM-YY)
    let dateClosedFormatted = null;
    if (csvRow['วันที่เสร็จ']) {
        const closedDateStr = csvRow['วันที่เสร็จ'].toString();
        const [closedDay, closedMonth, closedYear] = closedDateStr.split('-');
        const fullYear = closedYear.length === 2 ? '20' + closedYear : closedYear;
        const closedDate = new Date(fullYear, closedMonth - 1, closedDay);
        dateClosedFormatted = closedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    }

    return {
        name: `${jobNo} ${csvRow['JOB DESCRIPTION']} (งานเก่า)`,
        partner_name: csvRow['HOTEL/FIRM'],
        description: description,
        type: type,
        expected_revenue: expectedRevenue,
        probability: 100,
        date_closed: dateClosedFormatted,
        
        // date_deadline: date.toISOString().split('T')[0],
        // phone: csvRow.TEL?.toString() || '',
        // user_id: 20,  // Default salesperson ID
        // team_id: 1,  // Default sales team ID
        // priority: '1',
        
    };
}

// Main import function
async function importLeads() {
    try {
        console.log('Starting batch import process...');
        
        // Get all CSV files from data folder
        const dataDir = './data';
        const files = await fs.readdir(dataDir);
        const csvFiles = files.filter(file => file.endsWith('.csv')).sort();
        
        if (csvFiles.length === 0) {
            console.log('No CSV files found in ./data folder');
            return;
        }
        
        console.log(`Found ${csvFiles.length} CSV files to import:`, csvFiles);
        
        // Authenticate with Odoo
        const sessionId = await authenticate();
        console.log('Authentication successful');
        
        // Process each CSV file
        let totalSuccessCount = 0;
        let totalErrorCount = 0;
        let totalRecordsProcessed = 0;
        
        for (const csvFile of csvFiles) {
            console.log(`\n========== Processing ${csvFile} ==========`);
            
            try {
                // Read and parse CSV file
                const filePath = path.join(dataDir, csvFile);
                const fileContent = await fs.readFile(filePath, { encoding: 'utf8' });
                
                // Parse CSV using Papaparse
                const parseResult = Papa.parse(fileContent, {
                    header: true,
                    skipEmptyLines: true,
                    dynamicTyping: true
                });
                
                if (parseResult.errors.length > 0) {
                    console.error(`CSV parsing errors in ${csvFile}:`, parseResult.errors);
                    continue;
                }
                
                // Process each row in current CSV
                let fileSuccessCount = 0;
                let fileErrorCount = 0;
                
                for (const row of parseResult.data) {
                    try {
                        const leadData = transformToLead(row);
                        
                        console.log("leadData", leadData);
                        
                        await createLead("18950d19bcd85d15cae4b039da67941615366472;", leadData);
                        fileSuccessCount++;
                        totalSuccessCount++;
                        console.log(`Successfully created lead for ${row['HOTEL/FIRM']}`);
                    } catch (error) {
                        fileErrorCount++;
                        totalErrorCount++;
                        console.error(`Failed to create lead for ${row['HOTEL/FIRM']}:`, error.message);
                    }
                }
                
                totalRecordsProcessed += parseResult.data.length;
                
                console.log(`\nFile Summary for ${csvFile}:`);
                console.log(`Records processed: ${parseResult.data.length}`);
                console.log(`Successfully imported: ${fileSuccessCount}`);
                console.log(`Failed to import: ${fileErrorCount}`);
                
            } catch (error) {
                console.error(`Failed to process ${csvFile}:`, error.message);
            }
        }
        
        console.log('\n========== FINAL IMPORT SUMMARY ==========');
        console.log(`Total CSV files processed: ${csvFiles.length}`);
        console.log(`Total records processed: ${totalRecordsProcessed}`);
        console.log(`Total successfully imported: ${totalSuccessCount}`);
        console.log(`Total failed to import: ${totalErrorCount}`);
        
    } catch (error) {
        console.error('Import process failed:', error.message);
    }
}

// Execute the import
importLeads();