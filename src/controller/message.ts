export type Attachment = {
    name: string;
    size: number;
};

export type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    attachments?: Attachment[];
};
