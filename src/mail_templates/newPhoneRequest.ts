import dotenv from 'dotenv';
dotenv.config();

export const newPhoneRequest = ({
  name,
  description

}: { name: string, description: string }) => `<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Hi,</p>
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">${name} has request for a new phone number. Please review his request details and proceed accordingly.</p>
<h5 style="font-family: sans-serif; font-size: 18px; margin: 0; margin-bottom: 10px;">Details:</h5>
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 2px;">Description: ${description}</p>
`;
