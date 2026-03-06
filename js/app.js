const exportWord = () => {
  if (!resume.personal.name) {
    showToast('请先填写基本信息', 'fail');
    return;
  }

  // 检查 docx 库是否加载
  if (typeof docx === 'undefined') {
    showToast('DOCX库未加载，请刷新页面或检查网络', 'fail');
    return;
  }

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    PageOrientation,
  } = docx;

  // 字体映射
  const fontMap = {
    system: 'Calibri',
    sans: 'Arial',
    serif: 'Times New Roman',
    mono: 'Courier New'
  };
  const fontFamily = fontMap[customFont.value] || fontMap.system;
  const primaryColor = customColor.value;

  // 构建文档内容
  const children = [];

  // 姓名
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: resume.personal.name || '姓名',
          bold: true,
          size: 36,
          font: fontFamily,
          color: primaryColor,
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      thematicBreak: true,
    })
  );

  // 求职意向 + 联系方式
  const contactLine = `${resume.personal.jobTitle || ''} | ${resume.personal.email || ''} | ${resume.personal.phone || ''}`;
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: contactLine,
          size: 24,
          font: fontFamily,
          color: '444444',
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // 摘要
  if (resume.summary) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '摘要',
            bold: true,
            size: 28,
            font: fontFamily,
            color: primaryColor,
          })
        ],
        spacing: { before: 400, after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: resume.summary,
            size: 22,
            font: fontFamily,
          })
        ],
        spacing: { after: 200 },
      })
    );
  }

  // 工作经历
  if (resume.experience?.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '工作经历',
            bold: true,
            size: 28,
            font: fontFamily,
            color: primaryColor,
          })
        ],
        spacing: { before: 400, after: 200 },
      })
    );

    resume.experience.forEach((exp) => {
      // 标题行
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: exp.title || '',
              bold: true,
              size: 24,
              font: fontFamily,
            }),
            new TextRun({
              text: `  ${exp.company || ''}`,
              italics: true,
              size: 24,
              font: fontFamily,
            }),
            new TextRun({
              text: `  ${exp.date || ''}`,
              size: 20,
              font: fontFamily,
              color: '666666',
            }),
          ],
          spacing: { before: 120 },
        })
      );
      // 描述
      if (exp.description) {
        let descText = exp.description;
        if (Array.isArray(exp.description)) {
          descText = exp.description.join('\n');
        } else if (typeof exp.description === 'object') {
          descText = JSON.stringify(exp.description, null, 2);
        } else {
          descText = String(exp.description);
        }
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: descText,
                size: 22,
                font: fontFamily,
              })
            ],
            spacing: { after: 120 },
          })
        );
      }
    });
  }

  // 教育背景
  if (resume.education?.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '教育背景',
            bold: true,
            size: 28,
            font: fontFamily,
            color: primaryColor,
          })
        ],
        spacing: { before: 400, after: 200 },
      })
    );

    resume.education.forEach((edu) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: edu.degree || '',
              bold: true,
              size: 24,
              font: fontFamily,
            }),
            new TextRun({
              text: `  ${edu.school || ''}`,
              italics: true,
              size: 24,
              font: fontFamily,
            }),
            new TextRun({
              text: `  ${edu.date || ''}`,
              size: 20,
              font: fontFamily,
              color: '666666',
            }),
          ],
          spacing: { before: 120 },
        })
      );
    });
  }

  // 技能
  if (resume.skills?.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '技能',
            bold: true,
            size: 28,
            font: fontFamily,
            color: primaryColor,
          })
        ],
        spacing: { before: 400, after: 200 },
      })
    );

    const skillText = resume.skills.map(s => typeof s === 'string' ? s : (s.name || '')).join(' · ');
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: skillText,
            size: 22,
            font: fontFamily,
          })
        ],
        spacing: { after: 200 },
      })
    );
  }

  // 创建文档，设置 A4 页面
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.PORTRAIT,
              width: 11906,
              height: 16838,
            },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: children,
      },
    ],
  });

  // 生成并下载
  Packer.toBlob(doc).then((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${resume.personal.name || 'resume'}_简历.docx`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('导出成功', 'success');
  }).catch((err) => {
    console.error('导出失败', err);
    showToast('导出失败：' + err.message, 'fail');
  });
};
