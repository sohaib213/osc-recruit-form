import { Injectable } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import { CreateFormDto } from './dto/create-form.dto';

interface AppendResponse {
  spreadsheetId: string;
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
}

@Injectable()
export class FormService {
  private sheets!: sheets_v4.Sheets;
  private spreadsheetId: string;
  private readonly sheetName = 'Sheet1';

  constructor() {
    this.initializeGoogleSheets();
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '';
  }

  private initializeGoogleSheets(): void {
    const credentials = {
      type: process.env.GOOGLE_TYPE,
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: process.env.GOOGLE_AUTH_URI,
      token_uri: process.env.GOOGLE_TOKEN_URI,
      auth_provider_x509_cert_url:
        process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
    };

    const auth = new google.auth.GoogleAuth({
      credentials: credentials as any,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async add(createFormDto: CreateFormDto): Promise<{
    success: boolean;
    message: string;
    data: CreateFormDto;
  }> {
    console.log('Received form data:', createFormDto);
    try {
      const rowData: string[] = [
        createFormDto.name,
        createFormDto.email,
        String(createFormDto.academic_year),
        `'${createFormDto.phone}`,
        createFormDto.college,
        createFormDto.college_id,
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:G`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData],
        },
      });

      return {
        success: true,
        message: 'Form submitted successfully',
        data: createFormDto,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error submitting form:', errorMessage);
      throw new Error(`Failed to submit form: ${errorMessage}`);
    }
  }
}
