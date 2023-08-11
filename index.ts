import axios from 'axios';
import {load} from 'cheerio';
import mammoth = require("mammoth");
import {writeFileSync} from 'fs';
import {createClient} from '@supabase/supabase-js'


const supabaseUrl = 'https://fecnldjxpserceyiifwt.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

console.log(supabase.schema('public'))

test()


async function test(){
    let { data, error } = await supabase.from('group').select()

    if (error) console.error(error)
    else console.log(data)

}

//main()

async function parseTeachersFromSUAI() {
    const url = "https://pro.guap.ru"
    let response = await axios.get(url + "/professors?position=47&facultyWithChairs=389&subunit=0&fullname=&perPage=100")
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
    await parseTeachersFromSUAI()
    parseDocxFromVk();
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
            if (key == 'time' || value == "-------") {dayId++;continue;
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
                time_id: timeId, // номер предмета по расписанию
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
    const groupId = 144922677;
    const myToken = process.env.VK_TOKEN;


    let response = await axios.get(`https://api.vk.com/method/groups.getById?group_ids=${groupId}&fields=menu&access_token=${myToken}&v=5.131 HTTP/1.1`);

    // Получаем меню
    const groupMenu = response.data["response"][0]['menu'];
    // Получаем из меню ссылку на расписание
    const urlToDocx = groupMenu["items"].filter(ob => ob.title == "Расписание")[0]["url"] + "&no_preview=1";
    // Преобразование docx to html
    let htmlRasp = await mammoth.convertToHtml({buffer: (await loadDocxFromUrl(urlToDocx))})

    writeFileSync('shedule.html', htmlRasp.value)

    const schedules = parseSchedule(htmlRasp.value);

    // indexes
    let groupDbId = 1

    // Обход расписаний для каждой группы
    for (const groupName in schedules) {
        if (schedules.hasOwnProperty(groupName)) {
            // Добавление группы
            await
                supabase.from('group').insert({group_id: groupDbId++, group_name: groupName})
            await parseAndAddToTables(schedules[groupName].numerator,  groupDbId, true);
            await parseAndAddToTables(schedules[groupName].denominator, groupDbId, false);
        }
    }
    // console.log(parseSchedule(htmlRasp.value))
}
