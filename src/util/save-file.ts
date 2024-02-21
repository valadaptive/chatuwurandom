const saveFile = (contents: BlobPart, name: string, type?: string) => {
    const blob = new Blob([contents], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
};

export default saveFile;
