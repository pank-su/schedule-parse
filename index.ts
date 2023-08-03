
import axios from 'axios';
import {load} from 'cheerio';
import mammoth = require("mammoth");



main()

async function parseTeachersFromSUAI() {
    const url = "https://pro.guap.ru"
    let response = await axios.get(url + "/professors?position=47&facultyWithChairs=389&subunit=0&fullname=&perPage=100")
    let $ = load(response.data)
    const urls = $('#external_professors > div > div.col-lg-9 > div > div > div > div > div > div:nth-child(2) > h5 > a')
    for (const ur of urls) {
        const longName = ur.children[0]["data"].trim()
        console.log(longName)
        const link_prof = ur.attribs["href"]

        console.log(link_prof)
        //

    }
}

function main() {
    // parseDocxFromVk();
    parseTeachersFromSUAI()
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

    const schedules = parseSchedule(htmlRasp.value);

// Обход расписаний для каждой группы
    for (const groupName in schedules) {
        if (schedules.hasOwnProperty(groupName)) {
            console.log(`Расписание для группы ${groupName}:`);
            console.log('Неделя Числитель:');
            console.log(schedules[groupName].numerator);
            console.log('Неделя Знаменатель:');
            console.log(schedules[groupName].denominator);
        }
    }
    // console.log(parseSchedule(htmlRasp.value))
}
