export const creditLimitClientNotification = ({
  clientName,
  callDuration,
}: {
  clientName: string;
  callDuration: string;
}) => `
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Dear ${clientName},</p>
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
  We wanted to inform you that your recent call was automatically disconnected due to insufficient credits in your account.
</p>
<h5 style="font-family: sans-serif; font-size: 18px; margin: 0; margin-bottom: 10px;">Call Details:</h5>
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 2px;">
  <strong>Call Duration:</strong> ${callDuration} seconds
</p>

<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
  To continue using our services without interruption, please top up your account credits. 
  If you need assistance or have any questions, please don't hesitate to contact our support team.
</p>
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
  Thank you for using our telephone mediation services.
</p>
`;

export const creditLimitInterpreterNotification = ({
  interpreterName,
  clientPhone,
  callDuration,
}: {
  interpreterName: string;
  clientPhone: string;
  callDuration: string;
}) => `
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">Dear ${interpreterName},</p>
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
  We wanted to inform you that your recent call was automatically disconnected due to the client running out of credits.
</p>
<h5 style="font-family: sans-serif; font-size: 18px; margin: 0; margin-bottom: 10px;">Call Details:</h5>
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 2px;">
  <strong>Call Duration:</strong> ${callDuration} seconds
</p>

<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
  This is not due to any issue on your end. The client has been notified about the credit shortage and will contact you again if needed once they have topped up their account.
</p>
<p style="font-family: sans-serif; font-size: 14px; font-weight: normal; margin: 0; margin-bottom: 15px;">
  Thank you for your patience and continued service.
</p>
`;
