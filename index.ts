import axios from 'axios';
import {CheerioAPI, Element, load} from 'cheerio';
import {writeFileSync} from 'fs';
import {createClient} from '@supabase/supabase-js'
import * as pdf from 'pdf-parse'
import OpenAI from 'openai'
import * as util from "util";
import mammoth = require("mammoth");

const supabaseUrl = 'https://fecnldjxpserceyiifwt.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY
const openAIKEY = process.env.OPEN_AI_KEY

const openai = new OpenAI({
    apiKey: openAIKEY,
});
const supabase = createClient(supabaseUrl, supabaseKey)

var groupDbId = 1

console.log(supabase.schema('public'))

main()

async function test() {
    let {data, error} = await supabase.from('group').select()

    if (error) console.error(error)
    else console.log(data)

}

const timeFSPO = ["9:20 - 10:55", "11:05 - 12:40", "13:20 - 14:55", "15:05 - 16:40"]



//main()

async function parseTeachersFromSUAI() {
    const url = "https://pro.guap.ru"
    let response = await axios.get(url + "/professors?position=0&facultyWithChairs=0&subunit=0&fullname=&perPage=2000")
    let $ = load(response.data)
    const urls = $('#external_professors > div > div.col-lg-9 > div > div > div > div > div > div:nth-child(2) > h5 > a')
    let id = 1
    for (const ur of urls) {
        const longName = ur.children[0]["data"].trim()
        const link_prof = ur.attribs["href"]

        response = await axios.get(url + link_prof)

        let $ = load(response.data)
        const data = $('.list-group-item h5:contains(\'Email\') + div.small')
        let email = ''
        try {
            email = data.get()[0].children[0]["data"]
        } catch (e) {

        }
        let image_path = ''
        $('.profile_image').each((index, path) => {
            image_path = path.attribs['src']
        })
        await supabase.from('teacher').insert({
            id: id++,
            last_name: longName.split(' ')[0],
            first_name: longName.split(' ')[1],
            second_name: longName.split(' ')[2],
            email: email == '' ? null : email,
            photo: url + image_path
        })
    }
}

async function main() {
    // Удаление существующих данных
    await supabase.from('cabinet').delete().neq('cabinet_number', null)
    await supabase.from('schedule_teacher_cabinet').delete().neq('schedule_id', -1)
    await supabase.from('schedule').delete().neq('group_id', -1)
    await supabase.from('teacher').delete().neq('last_name', null)
    await supabase.from('group').delete().neq('group_name', null)
    await supabase.from('subject').delete().neq('subject_name', null)
    // await parseTeachersFromSUAI()

    await parseBigGuap()

    // parseDocxFromVk();
    // parsePDFWithChatGPT()
}


// Париснг pdf файла с помощью Chat GPT
async function downloadPDF() {
    const url = "https://new.guap.ru/fspo/uch"
    let response = await axios.get(url)
    let $ = load(response.data)

    const pdfUrl = $("#tab_uch_1 > div:nth-child(4) > div:nth-child(1) > ul > li > a")
    console.log(pdfUrl[0].attribs["href"])
    response = await axios.get(pdfUrl[0].attribs["href"], {
        responseType: "arraybuffer",
    });
    const data = await pdf(response.data)
    console.log(data.text.indexOf("РАСПИСАНИЕ ГРУППЫ", 40))
    const chatCompletion = await openai.chat.completions.create({
        messages: [{role: 'user', content: 'Say this is a test'}],
        model: 'gpt-3.5-turbo',
    });
    console.log(chatCompletion.choices)

}

// Функция для загрузки файла docx по URL
async function loadDocxFromUrl(url: string): Promise<any> {
    const response = await axios.get(url, {
        responseType: "arraybuffer",
    });
    return response.data;
}

interface ScheduleItem {
    time: string;
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
}

interface ScheduleGroup {
    numerator: ScheduleItem[];
    denominator: ScheduleItem[];
}

async function parseLessonElement(lessonElement: Element, timeRange: RegExpMatchArray, $: CheerioAPI, dayName: string) {
    const lesson = {
        timeStart: timeRange[1],
        timeEnd: timeRange[2],
        type: '',
        subjects: [],
    };

    // Определите тип занятия
    const text = $(lessonElement).next('div.study').text();
    // lesson.type = lessonType;

    let pattern = /.*[A-ZА-Я]+ \– ([A-Za-zА-Яа-я0-9ё \"\(\)\-,\.\:\;]{2,})  \– ([А-Яа-я0-9\. ]{2,}), ауд\. ([0-9\-а-я]{2,6}|спортзал)Преподаватель: ([А-Яа-я \.\-]{1,}) - .*/;

    console.log(text)

    if (text.includes("Преподаватели")) {
        pattern = /.*[A-ZА-Я]+ \– ([A-Za-zА-Яа-я0-9ё \"\(\)\-,\.\:\;]{2,})  \– ([А-Яа-я0-9\. ]{2,}), ауд\. ([0-9\-а-я]{2,6}|спортзал)Преподаватели: ([А-Яа-я \.\-]{1,}) - .*/;
    } else if (text.includes("спортзал") || !text.includes("Преподаватель")) {
        pattern = /.*[A-ZА-Я]+ \– ([A-Za-zА-Яа-я0-9ё \"\(\)\-,\.\:\;]{2,})  \– ([А-Яа-я0-9\. ]{2,}), ауд\. ([0-9\-а-я]{2,6}|спортзал).*/;
    }
    let match = text.match(pattern);
    if (match == null) {
        pattern = /.*[A-ZА-Я]+ \– ([A-Za-zА-Яа-я0-9ё \"\(\)\-,\.\:\;]{2,})  \– ([А-Яа-я0-9\. ]{2,}), ауд\./;
        match = text.match(pattern);
    }
    let isNumerator: boolean|null = null
    const [, subject, location, auditorium, teacher] = match;
    if (text.includes("▲") || text.includes("▼")){
        isNumerator = text.includes("▲")
    }


    const {data} = await supabase.from('subject').select('id').eq('subject_name', subject)
    let subjectIdForSchedule: number;
    // Если предмета нет в базе, то добавляем
    if (data.length == 0) {
        await supabase.from('subject').insert({id: subjectId++, subject_name: subject})
        subjectIdForSchedule = subjectId - 1
    } else {
        subjectIdForSchedule = data[0].id
    }

    if (isNumerator == null){
        await supabase.from('schedule').insert({
            id: curId++, // Id
            group_id: groupDbId - 1, // id группы
            subject_id: subjectIdForSchedule, // id предмета
            time_str: `${timeRange[0]} - ${timeRange[1]}`, // номер предмета по расписанию
            is_numerator: false, // это числитель?
            day_id: dayIdFromName(dayName) // день недели
        })
        await supabase.from('schedule').insert({
            id: curId++, // Id
            group_id: groupDbId - 1, // id группы
            subject_id: subjectIdForSchedule, // id предмета
            time_str: `${timeRange[0]} - ${timeRange[1]}`, // номер предмета по расписанию
            is_numerator: true, // это числитель?
            day_id: dayIdFromName(dayName) // день недели
        })
    } else{
        await supabase.from('schedule').insert({
            id: curId++, // Id
            group_id: groupDbId - 1, // id группы
            subject_id: subjectIdForSchedule, // id предмета
            time_str: `${timeRange[0]} - ${timeRange[1]}`, // номер предмета по расписанию
            is_numerator: isNumerator, // это числитель?
            day_id: dayIdFromName(dayName) // день недели
        })
    }
    let department_id = 5
    try {
        let department_id = (await supabase.from("department").select("id").eq("address", location).single()).data.id
    }catch (e) {

    }

    console.log(auditorium)

    await supabase.from('cabinet').insert({
        cabinet_number: auditorium,
        department_id: department_id,
    })

    // const response = await supabase.rpc('find_teacher', {inicials: teacher.trim()})

    console.log(teacher)
    // console.log(response.data)
    return lesson
}

function dayIdFromName(name: String){
    return ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"].indexOf(name.trim())
}

async function parseBigGuap() {
    const url = "https://guap.ru/rasp/"

    for (let i = 1; i < 529; i++) {
        let response = await axios.get(url + "?g=" + i)
        let $ = load(response.data)

        const schedule = {
            group: '',
            days: [],
            numerator: false
        };

        const groupInfo = $('h2').text().match(/группы - ([0-9МКСАВИ]{1,})/i);
        if (groupInfo) {
            schedule.group = groupInfo[1]
        }
        await
            supabase.from('group').insert({group_id: groupDbId++, group_name: schedule.group})
        console.log(groupInfo)

        $('h3').each((_, dayElement) => {

            if ($(dayElement).text().includes("Вне сетки расписания")){
                return;
            }
            const day = {
                name: $(dayElement).text(),
                lessons: [],
            };


            // Выберите все пары в текущем дне
            $(dayElement)
                .nextUntil('h3')
                .filter('h4')
                .each((_, lessonElement) => {
                    const timeRange = $(lessonElement).text().match(/(\d+:\d+)–(\d+:\d+)/);
                    if (timeRange) {
                        parseLessonElement(lessonElement, timeRange, $, day.name).then(
                            (lesson) => day.lessons.push(lesson)
                        )

                        // Выберите все предметы в текущей паре
                        // $(lessonElement)
                        //     .next('div.study')
                        //     .find('span > b')
                        //     .each((_, subjectElement) => {
                        //         const subject = $(subjectElement).text();
                        //         lesson.subjects.push(subject);
                        //     });


                    }
                });

            schedule.days.push(day);
        })
        //console.log(util.inspect(schedule, {showHidden: false, depth: null, colors: true}))
        // $("#Form1 > div.page > div > div.result > h3:nth-child(7)")
    }
    while (groupDbId != 528){

    }

}

function parseSchedule(data: string): Record<string, ScheduleGroup> {
    const scheduleGroups: Record<string, ScheduleGroup> = {};

    const $ = load(data);

    $('table').each((tableIndex, tableElement) => {
        const scheduleTitle = $(tableElement).prev().text().trim();
        const regex = /ГРУППЫ\s+(.*?)\s+неделя\s+(.*?)$/;
        const match = scheduleTitle.match(regex);
        const group = match[1]; // Группа
        const week = match[2];

        const scheduleGroup: ScheduleGroup = {
            numerator: [],
            denominator: [],
        };

        $(tableElement)
            .find('tr')
            .each((rowIndex, rowElement) => {
                if (rowIndex === 0) {
                    return; // Пропускаем заголовок таблицы
                }

                const scheduleItem: ScheduleItem = {
                    time: '',
                    monday: '',
                    tuesday: '',
                    wednesday: '',
                    thursday: '',
                    friday: '',
                    saturday: '',
                };

                $(rowElement)
                    .find('td')
                    .each((cellIndex, cellElement) => {
                        const cellText = $(cellElement).text().trim();

                        switch (cellIndex) {
                            case 1:
                                scheduleItem.time = cellText;
                                break;
                            case 2:
                                scheduleItem.monday = cellText;
                                break;
                            case 3:
                                scheduleItem.tuesday = cellText;
                                break;
                            case 4:
                                scheduleItem.wednesday = cellText;
                                break;
                            case 5:
                                scheduleItem.thursday = cellText;
                                break;
                            case 6:
                                scheduleItem.friday = cellText;
                                break;
                            case 7:
                                scheduleItem.saturday = cellText;
                                break;
                        }
                    });
                if (scheduleGroups[group] == undefined)
                    scheduleGroups[group] = scheduleGroup
                if (tableIndex % 2 === 0) {
                    scheduleGroups[group].numerator.push(scheduleItem);
                } else {
                    scheduleGroups[group].denominator.push(scheduleItem);
                }
            });


    });

    return scheduleGroups;
}

var subjectId = 1
var curId = 1

/// Дополучение данных из записей в расписание и добавление в нужные таблицы
async function parseAndAddToTables(schedule: ScheduleItem[], groupDbId: number, isNumerator: boolean) {
    // предмет по расписанию
    let timeId = 0
    for (const time of schedule) {
        timeId++;
        // День недели
        let dayId = 0;
        for (const [key, value] of Object.entries(time)) {
            // Урока нет по расписанию
            if (key == 'time' || value == "-------") {
                dayId++;
                continue;
            }
            let sepCount = 0

            // Количкство кабинетов
            sepCount += (value.match(/[0-9]{3}|сз[1-4]/g) || []).length
            // Получение всей информации с предмета (название, преподователь, кабинет)
            let matched: any;
            // Если кабинет один, то обрабатываем обычным паттерном
            if (sepCount == 1) {
                matched = value.match(/([А-Яa-я\.\,\-\:ё 0-9()]+) ([А-Я][a-я]+\s[А-Я]\.[А-Я]\.) (ауд\.)([0-9]{3},[0-9]{3}|[0-9]{3}|сз[1-4]|)/)

            } else if (sepCount == 0) {
                // без получения кабинета
                matched = value.match(/([А-Яa-я\.\,\-\:ё 0-9()]+) ([А-Я][a-я]+\s[А-Я]\.[А-Я]\.)/)
            } else {
                // Если несколько, то добавляем нужное количество патернов
                const authorRegExp = "([А-Я][a-я]+\\s[А-Я]\\.[А-Я]\\.)"
                const cabRegExp = "([0-9]{3})"
                const newRegExp = `([А-Яa-я\\.\\,\\-\\:ё 0-9()]+) (${Array(sepCount).fill(authorRegExp).join(' ')}) (ауд\\.)(${Array(sepCount).fill(cabRegExp).join(',')})`
                matched = value.match(newRegExp)
            }
            // Проверяем есть ли предмет в базе
            const {data} = await supabase.from('subject').select('id').eq('subject_name', matched[1])
            let subjectIdForSchedule: number;
            // Если предмета нет в базе, то добавляем
            if (data.length == 0) {
                await supabase.from('subject').insert({id: subjectId++, subject_name: matched[1]})
                subjectIdForSchedule = subjectId - 1
            } else {
                subjectIdForSchedule = data[0].id
            }
            // Добавляем в расписание
            await supabase.from('schedule').insert({
                id: curId++, // Id
                group_id: groupDbId - 1, // id группы
                subject_id: subjectIdForSchedule, // id предмета
                time_str: timeFSPO[timeId - 1], // номер предмета по расписанию
                is_numerator: isNumerator, // это числитель?
                day_id: dayId++ // день недели
            })
            // Если нет кабинета, то добавляем без кабинета
            if (sepCount == 0) {
                const response = await supabase.rpc('find_teacher', {inicials: matched[2]})
                await supabase.from('schedule_teacher_cabinet').insert({
                    schedule_id: curId,
                    teacher_id: response.data,
                    cabinet_number: null
                })
                continue
            }
            // Получение и добавление кабинетов в таблицу cabinet
            const cabinets: string[] = []
            for (let i = matched.length - 1; i >= matched.length - (sepCount); i--) {
                await supabase.from('cabinet').insert({
                    cabinet_number: matched[i],
                    floor: matched[i].startsWith('сз') ? null : Number(matched[i][0]),
                    info: matched[i].startsWith('сз') ? 'Спортивный зал' : null
                })
                cabinets.push(matched[i])
            }
            // Добавление информации о записи в расписании (преподаватель и кабинет)
            let cabId = 0
            for (let i = 2 + (sepCount > 1 ? 1 : 0); i < 2 + sepCount + (sepCount > 1 ? 1 : 0); i++) {
                const response = await supabase.rpc('find_teacher', {inicials: matched[i]})
                const {error} = await supabase.from('schedule_teacher_cabinet').insert({
                    schedule_id: curId - 1,
                    teacher_id: response.data,
                    cabinet_number: cabinets[cabId++]
                })
                console.log(error)
            }

        }
    }
}


async function parseDocxFromVk() {
    // Получаем данные из вконтакте о группе
    const groupId = 222976377;
    const myToken = process.env.VK_TOKEN;


    let response = await axios.get(`https://api.vk.com/method/groups.getById?group_ids=${groupId}&fields=menu&access_token=${myToken}&v=5.131 HTTP/1.1`);

    // Получаем меню
    const groupMenu = response.data["response"][0]['menu'];
    // Получаем из меню ссылку на расписание
    const urlToDocx = groupMenu["items"].filter(ob => ob.title == "Расписание")[0]["url"] + "?no_preview=1";
    // Преобразование docx to html
    let htmlRasp = await mammoth.convertToHtml({buffer: (await loadDocxFromUrl(urlToDocx))})

    writeFileSync('shedule.html', htmlRasp.value)

    const schedules = parseSchedule(htmlRasp.value);

    console.log(util.inspect(schedules, {showHidden: false, depth: null, colors: true}))

    // indexes


    // Обход расписаний для каждой группы
    for (const groupName in schedules) {
        if (schedules.hasOwnProperty(groupName)) {
            // Добавление группы
            await
                supabase.from('group').insert({group_id: groupDbId++, group_name: groupName})
            await parseAndAddToTables(schedules[groupName].numerator, groupDbId, true);
            await parseAndAddToTables(schedules[groupName].denominator, groupDbId, false);
        }
    }
    console.log(parseSchedule(htmlRasp.value))
}
