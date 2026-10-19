declare const qqmusicTicket_base: any;
export declare class qqmusicTicket extends qqmusicTicket_base {
    constructor();
    ticket(e: any): Promise<boolean>;
    sendTicketCard(e: any, cfg: any, data: any, formatText: any): Promise<void>;
}
export {};
