export const getFileType = (extension) => {
  switch (extension.toLowerCase()) {
    case ".docx":
      return "Microsoft Word Document";
    case ".mp3":
      return "mp3 Audio";
    case ".pdf":
      return "PDF Document";
    case ".jpg":
    case ".jpeg":
    case ".png":
      return "Image File";
    case ".html":
    case ".htm":
      return "HTML Document";
    case ".txt":
      return "Plain Text File";
    case ".doc":
      return "Microsoft Word Document";
    case ".xls":
      return "Microsoft Excel Spreadsheet";
    case ".ppt":
      return "Microsoft PowerPoint Presentation";
    case ".zip":
      return "Zip Archive";
    case ".rar":
      return "RAR Archive";
    case ".7z":
      return "7-Zip Archive";
    case ".tar":
      return "Tar Archive";
    case ".gz":
      return "Gzip Archive";
    case ".exe":
      return "Executable File";
    case ".dll":
      return "Dynamic Link Library";
    case ".csv":
      return "Comma Separated Values File";
    case ".json":
      return "JSON File";
    case ".xml":
      return "XML File";
    case ".mp4":
      return "MP4 Video";
    case ".avi":
      return "AVI Video";
    case ".mkv":
      return "Matroska Video";
    case ".wav":
      return "WAV Audio";
    case ".aac":
      return "Advanced Audio Coding";
    case ".flac":
      return "Free Lossless Audio Codec";
    case ".psd":
      return "Adobe Photoshop Document";
    case ".ai":
      return "Adobe Illustrator Document";
    case ".indd":
      return "Adobe InDesign Document";
    case ".svg":
      return "Scalable Vector Graphics";
    case ".pptx":
      return "Microsoft PowerPoint Presentation";
    case ".odt":
      return "OpenDocument Text Document";
    case ".ods":
      return "OpenDocument Spreadsheet";
    case ".odp":
      return "OpenDocument Presentation";
    case ".csv":
      return "Comma Separated Values File";
    case ".tsv":
      return "Tab Separated Values File";
    case ".mpg":
      return "MPEG Video";
    case ".mov":
      return "QuickTime Video";
    case ".wmv":
      return "Windows Media Video";
    case ".wma":
      return "Windows Media Audio";
    case ".aac":
      return "Advanced Audio Coding";
    case ".mpga":
      return "MPEG Audio";
    case ".docm":
      return "Microsoft Word Macro-Enabled Document";
    case ".dotm":
      return "Microsoft Word Macro-Enabled Template";
    case ".xlsm":
      return "Microsoft Excel Macro-Enabled Spreadsheet";
    case ".xltm":
      return "Microsoft Excel Macro-Enabled Template";
    case ".pptm":
      return "Microsoft PowerPoint Macro-Enabled Presentation";
    case ".potm":
      return "Microsoft PowerPoint Macro-Enabled Template";
    case ".sldm":
      return "Microsoft PowerPoint Macro-Enabled Slide Show";
    case ".ppsm":
      return "Microsoft PowerPoint Macro-Enabled Show";
    case ".epub":
      return "EPUB Document";
    case ".md":
      return "Markdown File";
    default:
      return extension.slice(1);
  }
}
