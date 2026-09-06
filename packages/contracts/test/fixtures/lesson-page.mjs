/** Fresh data for schema, projection and agent workflow tests. */
export function lessonPageFixture() {
  return {
    title: 'التبخر والتكاثف',
    introduction: 'نتتبع ما يحدث للماء عندما يسخن ثم يبرد.',
    outcomes: ['يفسر الطالب تحول بخار الماء إلى قطرات عند التبريد.'],
    blocks: [
      {
        kind: 'concept',
        title: 'كيف يتغير الماء؟',
        body: 'تسخن الشمس الماء فيتبخر.\nعندما يبرد البخار يتكاثف ويصبح قطرات ماء.',
      },
      {
        kind: 'practice',
        title: 'جرّب التفسير',
        body: 'صف ما تتوقع ظهوره على السطح البارد، ثم فسّر السبب.',
      },
    ],
    summary: ['التسخين يساعد على التبخر، والتبريد يؤدي إلى التكاثف.'],
    preparation: {
      overview: 'تحضير خاص بالمعلم: افترض معرفة الطلاب بالحرارة والبرودة.',
      steps: [
        { title: 'تهيئة', minutes: 10, instructions: 'استدعِ خبرة الطلاب بالماء والجو.' },
        { title: 'شرح وممارسة', minutes: 25, instructions: 'نمذج التفسير ثم دع الطلاب يحاولون.' },
        { title: 'تحقق', minutes: 10, instructions: 'اسأل عن السبب وناقش التفسيرات.' },
      ],
      misconceptions: [
        { idea: 'قد يخلط الطالب بين التبخر والتكاثف.', response: 'قارن أثر التسخين بأثر التبريد.' },
      ],
    },
    activity: {
      title: 'نتحقق من فهم تغير الماء',
      questions: [
        {
          type: 'choice',
          prompt: 'ماذا يحدث لبخار الماء عندما يبرد؟',
          options: [
            { text: 'يتكاثف إلى قطرات ماء', isCorrect: true },
            { text: 'يسخن أكثر', isCorrect: false },
          ],
        },
        {
          type: 'text',
          prompt: 'فسّر ظهور قطرات الماء على سطح بارد.',
          expectedAnswer: 'مفتاح المعلم الخاص: يبرد بخار الماء على السطح فيتكاثف.',
        },
      ],
    },
  };
}
