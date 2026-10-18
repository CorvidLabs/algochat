import { AlgorandService, type ChatAccount } from '../../../../ts/dist/index.js';
declare const service: AlgorandService;
declare const account: ChatAccount;
declare const recipient: string;
declare const recipientKey: Uint8Array;
await service.sendMessage(account, recipient, recipientKey, 'Hello!');
await service.sendReply(account, recipient, recipientKey, 'Reply text', {
    messageId: 'original-tx-id',
    preview: 'Original message preview...',
});
